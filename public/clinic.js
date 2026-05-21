/* NOMOI Front Desk — clinic view logic.
 *
 * Read-only list of submitted intakes, gated by a shared passcode.
 *
 * v1 read model: patient records are private (RLS gives anon INSERT only,
 * no read). A static page therefore cannot safely hold a key that can read
 * patient data. So the clinic operator enters the read key at runtime; it
 * lives only in this tab's memory and is never written into the repo, the
 * page, or storage. For a hosted multi-clinic v2 this is replaced by a thin
 * authenticated backend route. See README.
 */
(function () {
  'use strict';

  var CFG = window.__FRONTDESK_CONFIG || {};
  var emit = window.__nomoiSurfaceEmit || function () {};

  var gate = document.getElementById('gate');
  var dash = document.getElementById('dash');
  var gateErr = document.getElementById('gateErr');
  var tableHost = document.getElementById('tableHost');
  var countEl = document.getElementById('count');
  var slugFilter = document.getElementById('slugFilter');

  var sb = null;
  var allRows = [];          // every intake loaded, unfiltered
  var activeSlug = '';       // current slug filter, '' means all clinics

  document.getElementById('enterBtn').addEventListener('click', enter);
  document.getElementById('keyInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') enter();
  });
  document.getElementById('refreshBtn').addEventListener('click', loadIntakes);
  slugFilter.addEventListener('change', function () {
    activeSlug = slugFilter.value;
    renderFiltered();
    emit('clinic_slug_filter', { slug: activeSlug || 'all' });
  });

  function enter() {
    var pass = document.getElementById('passInput').value.trim();
    var key = document.getElementById('keyInput').value.trim();
    gateErr.style.display = 'none';

    if (pass !== (CFG.CLINIC_PASSCODE || 'frontdesk2026')) {
      gateErr.textContent = 'That passcode is not correct.';
      gateErr.style.display = 'block';
      return;
    }
    if (!key) {
      gateErr.textContent = 'Enter the read key to load intakes.';
      gateErr.style.display = 'block';
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      gateErr.textContent = 'The Supabase client did not load. Check the connection and reload.';
      gateErr.style.display = 'block';
      return;
    }

    try {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, key, {
        db: { schema: CFG.SCHEMA || 'frontdesk' },
        auth: { persistSession: false }
      });
    } catch (e) {
      gateErr.textContent = 'Could not start the client. Check the read key.';
      gateErr.style.display = 'block';
      return;
    }

    emit('clinic_view_unlocked', {});
    gate.style.display = 'none';
    dash.classList.add('show');
    loadIntakes();
  }

  /* ---- Per-clinic link generator (v2) -------------------------------
   * The operator enters a clinic slug (and an optional display name) and
   * gets a shareable intake URL with a copy-to-clipboard control. The
   * slug must match the same rule app.js applies on the intake side
   * (lowercase letters, digits, hyphens) so a generated link always
   * round-trips to a clean source_link_id.
   */
  var lgSlug = document.getElementById('lgSlug');
  var lgName = document.getElementById('lgName');
  var lgErr = document.getElementById('lgErr');
  var lgOut = document.getElementById('lgOut');
  var lgUrl = document.getElementById('lgUrl');
  var lgNote = document.getElementById('lgNote');
  var lgCopyBtn = document.getElementById('lgCopyBtn');

  function normaliseSlug(raw) {
    return String(raw || '').trim().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }

  function buildIntakeUrl() {
    var slug = normaliseSlug(lgSlug.value);
    lgErr.style.display = 'none';
    if (!slug) {
      lgErr.textContent = 'Enter a clinic slug. Use letters, numbers, and hyphens.';
      lgErr.style.display = 'block';
      lgOut.classList.remove('show');
      return;
    }
    // Show the operator the cleaned slug if it differs from what they typed.
    if (slug !== lgSlug.value.trim()) lgSlug.value = slug;
    var origin = location.origin || 'https://frontdesk.nomoi.ai';
    var url = origin + '/?clinic=' + encodeURIComponent(slug);
    lgUrl.textContent = url;
    var name = lgName.value.trim();
    lgNote.textContent = name
      ? 'Share this link with ' + name + '. Intakes opened through it are tagged "' + slug + '".'
      : 'Share this link. Intakes opened through it are tagged "' + slug + '".';
    lgOut.classList.add('show');
    lgCopyBtn.textContent = 'Copy';
    emit('clinic_link_generated', { slug: slug });
  }

  document.getElementById('lgMakeBtn').addEventListener('click', buildIntakeUrl);
  lgSlug.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') buildIntakeUrl();
  });
  lgName.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') buildIntakeUrl();
  });

  lgCopyBtn.addEventListener('click', function () {
    var url = lgUrl.textContent;
    if (!url) return;
    function ok() {
      lgCopyBtn.textContent = 'Copied';
      setTimeout(function () { lgCopyBtn.textContent = 'Copy'; }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(ok, fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      try {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok();
      } catch (e) {
        lgCopyBtn.textContent = 'Copy failed';
        setTimeout(function () { lgCopyBtn.textContent = 'Copy'; }, 1800);
      }
    }
  });

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadIntakes() {
    if (!sb) return;
    tableHost.innerHTML = '<div class="loading">Loading intakes...</div>';
    sb.from(CFG.TABLE || 'intakes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(function (res) {
        if (res.error) {
          tableHost.innerHTML =
            '<div class="load-err">Could not load intakes. ' +
            esc(res.error.message || 'Check the read key and that the migration is applied.') +
            '</div>';
          return;
        }
        allRows = res.data || [];
        rebuildSlugFilter();
        renderFiltered();
      })
      .catch(function (err) {
        tableHost.innerHTML =
          '<div class="load-err">Could not reach Supabase. ' + esc(String(err)) + '</div>';
      });
  }

  // Rebuild the slug dropdown from whatever slugs appear in the loaded rows.
  function rebuildSlugFilter() {
    var seen = {};
    allRows.forEach(function (r) {
      var s = r.source_link_id;
      if (s) seen[s] = (seen[s] || 0) + 1;
    });
    var slugs = Object.keys(seen).sort();
    var opts = '<option value="">All clinics</option>';
    slugs.forEach(function (s) {
      opts += '<option value="' + esc(s) + '">' + esc(s) + ' (' + seen[s] + ')</option>';
    });
    // Keep the current selection if it still exists in the data.
    if (activeSlug && slugs.indexOf(activeSlug) === -1) activeSlug = '';
    slugFilter.innerHTML = opts;
    slugFilter.value = activeSlug;
  }

  // Apply the active slug filter and render the resulting rows.
  function renderFiltered() {
    var rows = activeSlug
      ? allRows.filter(function (r) { return r.source_link_id === activeSlug; })
      : allRows;
    render(rows);
  }

  function render(rows) {
    var label = activeSlug ? ' for ' + activeSlug : '';
    countEl.textContent = rows.length + (rows.length === 1 ? ' intake' : ' intakes') + label;
    if (!rows.length) {
      tableHost.innerHTML =
        '<div class="empty">' +
        (activeSlug
          ? 'No intakes for "' + esc(activeSlug) + '" yet.'
          : 'No intakes yet. They will appear here as patients submit them.') +
        '</div>';
      return;
    }

    var html = '<table><thead><tr>' +
      '<th>Patient</th><th>Clinic</th><th>Submitted</th><th>Reason</th><th>Status</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function (r, i) {
      var hist = r.history || {};
      var conds = (hist.conditions || []);
      var slug = r.source_link_id;
      html += '<tr class="row" data-i="' + i + '">' +
        '<td><div class="pat-name">' + esc(r.full_name) + '</div>' +
        '<div class="pat-meta">' + esc(r.phone || '') +
        (r.date_of_birth ? ' · DOB ' + esc(r.date_of_birth) : '') + '</div></td>' +
        '<td>' + (slug
          ? '<span class="slug-tag">' + esc(slug) + '</span>'
          : '<span class="slug-tag none">—</span>') + '</td>' +
        '<td>' + esc(fmtDate(r.created_at)) + '</td>' +
        '<td>' + esc((r.reason_for_visit || '').slice(0, 60)) +
        ((r.reason_for_visit || '').length > 60 ? '...' : '') + '</td>' +
        '<td><span class="status ' + esc(r.status || 'submitted') + '">' +
        esc(r.status || 'submitted') + '</span></td>' +
        '</tr>';

      html += '<tr class="detail" data-detail="' + i + '"><td colspan="5"><div class="detail-body">' +
        '<div class="detail-grid">' +
        '<div class="dgroup"><h3>Contact</h3>' +
        kv('Name', r.full_name) + kv('Date of birth', r.date_of_birth) +
        kv('Phone', r.phone) + kv('Email', r.email) +
        kv('Address', [r.address_line, r.address_city, r.address_postcode].filter(Boolean).join(', ')) +
        '</div>' +
        '<div class="dgroup"><h3>Insurance</h3>' +
        kv('Provider', r.insurance_provider) + kv('Member ID', r.insurance_member_id) +
        kv('Group no', r.insurance_group_no) +
        '<div class="photo-row">' +
        photoLink('Insurance card', r.insurance_card_path) +
        photoLink('Government ID', r.gov_id_path) +
        '</div></div>' +
        '<div class="dgroup"><h3>Reason for visit</h3>' +
        '<div class="kv"><span class="v">' + esc(r.reason_for_visit || '—') + '</span></div></div>' +
        '<div class="dgroup"><h3>Medical history</h3>' +
        kv('Allergies', hist.allergies) + kv('Medications', hist.medications) +
        '<div class="kv"><span class="k">Conditions</span></div>' +
        (conds.length
          ? '<div class="chips">' + conds.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div>'
          : '<div class="kv"><span class="v">None reported</span></div>') +
        '</div>' +
        '<div class="dgroup"><h3>Consent</h3>' +
        kv('Treat', r.consent_treat ? 'Given' : 'Not given') +
        kv('Privacy', r.consent_privacy ? 'Acknowledged' : 'Not acknowledged') +
        '</div>' +
        '<div class="dgroup"><h3>Reference</h3>' +
        kv('Intake ID', r.id) + kv('Clinic slug', r.source_link_id) +
        '</div>' +
        '</div></div></td></tr>';
    });
    html += '</tbody></table>';
    tableHost.innerHTML = html;

    tableHost.querySelectorAll('tr.row').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var i = tr.getAttribute('data-i');
        var detail = tableHost.querySelector('tr.detail[data-detail="' + i + '"]');
        if (detail) {
          detail.classList.toggle('open');
          if (detail.classList.contains('open')) emit('clinic_intake_expanded', {});
        }
      });
    });
  }

  function kv(k, v) {
    return '<div class="kv"><span class="k">' + esc(k) + '</span> ' +
      '<span class="v">' + esc(v || '—') + '</span></div>';
  }

  function photoLink(label, path) {
    if (!path) {
      return '<span class="photo-link none">' + esc(label) + ': none</span>';
    }
    return '<a class="photo-link" href="#" data-photo="' + esc(path) + '">View ' + esc(label) + '</a>';
  }

  // Card photos live in a private bucket. Generate a short-lived signed URL.
  tableHost && tableHost.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[data-photo]');
    if (!a || !sb) return;
    ev.preventDefault();
    var path = a.getAttribute('data-photo');
    sb.storage.from(CFG.BUCKET || 'frontdesk-cards')
      .createSignedUrl(path, 120)
      .then(function (res) {
        if (res.error || !res.data) {
          alert('Could not open that photo. ' + (res.error ? res.error.message : ''));
          return;
        }
        window.open(res.data.signedUrl, '_blank', 'noopener');
      });
  });
})();
