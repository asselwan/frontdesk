/* NOMOI Front Desk — patient intake logic.
 *
 * Multi-step flow, inline validation, photo upload, and a Supabase write.
 * If the anon key is not yet configured, the form runs in demo mode: it
 * validates and shows the confirmation screen, but does not call Supabase.
 */
(function () {
  'use strict';

  var CFG = window.__FRONTDESK_CONFIG || {};
  var emit = window.__nomoiSurfaceEmit || function () {};

  /* ---- Per-clinic link slug (v2) ------------------------------------
   * Reads ?clinic=<slug> from the intake URL. Slugs are normalised to
   * lowercase and stripped of anything that is not a letter, digit, or
   * hyphen, so a malformed link cannot inject odd values into the row.
   * ?link= is accepted as a fallback for v1-era links. Returns null when
   * no usable slug is present.
   */
  function clinicSlug() {
    var qs = new URLSearchParams(location.search);
    var raw = qs.get('clinic') || qs.get('link') || '';
    var slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64);
    return slug || null;
  }

  var CONFIGURED =
    !!CFG.SUPABASE_URL &&
    !!CFG.ANON_KEY &&
    CFG.ANON_KEY !== 'REPLACE_WITH_SUPABASE_ANON_KEY';

  var sb = null;
  if (CONFIGURED && window.supabase && window.supabase.createClient) {
    try {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.ANON_KEY, {
        db: { schema: CFG.SCHEMA || 'frontdesk' },
        auth: { persistSession: false }
      });
    } catch (e) {
      sb = null;
    }
  }
  if (!sb) {
    document.getElementById('demoBanner').classList.add('show');
  }

  /* ---- Common conditions checklist ---------------------------------- */
  var CONDITIONS = [
    'Hypertension', 'Diabetes', 'Asthma', 'Heart disease',
    'Thyroid disorder', 'Kidney disease', 'Depression or anxiety',
    'Cancer (current or past)'
  ];
  var condWrap = document.getElementById('conditionList');
  CONDITIONS.forEach(function (name) {
    var lab = document.createElement('label');
    lab.className = 'check';
    lab.innerHTML =
      '<input type="checkbox" name="condition" value="' + name + '" />' +
      '<span class="box"></span>' +
      '<span class="c-text">' + name + '</span>';
    condWrap.appendChild(lab);
  });

  /* ---- Step navigation ---------------------------------------------- */
  var TOTAL = 4;
  var current = 1;
  var steps = {};
  document.querySelectorAll('.step[data-step]').forEach(function (el) {
    steps[el.getAttribute('data-step')] = el;
  });
  var fill = document.getElementById('progressFill');
  var stepLabels = document.querySelectorAll('#progressSteps span');

  function renderProgress() {
    fill.style.width = (current / TOTAL) * 100 + '%';
    stepLabels.forEach(function (s) {
      var n = parseInt(s.getAttribute('data-step'), 10);
      s.classList.toggle('active', n === current);
      s.classList.toggle('done', n < current);
    });
  }

  function showStep(n) {
    Object.keys(steps).forEach(function (k) {
      steps[k].hidden = parseInt(k, 10) !== n;
    });
    current = n;
    renderProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    emit('intake_step_view', { step: n });
  }

  /* ---- Validation ---------------------------------------------------- */
  function setInvalid(fieldEl, msg) {
    fieldEl.classList.add('invalid');
    if (msg) {
      var err = fieldEl.querySelector('.field-err');
      if (err) err.textContent = msg;
    }
  }
  function clearInvalid(fieldEl) {
    fieldEl.classList.remove('invalid');
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  function isValidDob(v) {
    if (!v) return false;
    var d = new Date(v + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    var now = new Date();
    if (d > now) return false;
    if (d.getFullYear() < 1900) return false;
    return true;
  }

  // Required fields per step. Returns true if the step is valid.
  function validateStep(n) {
    var ok = true;
    var stepEl = steps[String(n)];

    if (n === 1) {
      ok = checkRequiredText(stepEl, 'full_name', 'Please enter your full name.') && ok;
      var dobF = stepEl.querySelector('[data-name="date_of_birth"]');
      var dobV = dobF.querySelector('input').value.trim();
      if (!isValidDob(dobV)) { setInvalid(dobF, 'Please enter a valid date of birth.'); ok = false; }
      else clearInvalid(dobF);
      ok = checkRequiredText(stepEl, 'phone', 'Please enter a contact number.') && ok;
      var emF = stepEl.querySelector('[data-name="email"]');
      var emV = emF.querySelector('input').value.trim();
      if (emV && !isEmail(emV)) { setInvalid(emF, 'Please enter a valid email address.'); ok = false; }
      else clearInvalid(emF);
      ok = checkRequiredText(stepEl, 'address_line', 'Please enter your street address.') && ok;
      ok = checkRequiredText(stepEl, 'address_city', 'Please enter your city.') && ok;
    }

    if (n === 2) {
      ok = true; // all of step 2 is optional
    }

    if (n === 3) {
      ok = checkRequiredText(stepEl, 'reason_for_visit', 'Please tell us the reason for your visit.') && ok;
    }

    if (n === 4) {
      var ct = stepEl.querySelector('[data-name="consent_treat"]');
      var ctErr = stepEl.querySelector('[data-name="consent_treat_err"]');
      if (!ct.querySelector('input').checked) {
        ct.classList.add('invalid'); ctErr.classList.add('invalid'); ok = false;
      } else { ct.classList.remove('invalid'); ctErr.classList.remove('invalid'); }
      var cp = stepEl.querySelector('[data-name="consent_privacy"]');
      var cpErr = stepEl.querySelector('[data-name="consent_privacy_err"]');
      if (!cp.querySelector('input').checked) {
        cp.classList.add('invalid'); cpErr.classList.add('invalid'); ok = false;
      } else { cp.classList.remove('invalid'); cpErr.classList.remove('invalid'); }
    }

    return ok;
  }

  function checkRequiredText(stepEl, name, msg) {
    var f = stepEl.querySelector('[data-name="' + name + '"]');
    if (!f) return true;
    var input = f.querySelector('input, textarea');
    if (!input.value.trim()) { setInvalid(f, msg); return false; }
    clearInvalid(f);
    return true;
  }

  // Clear a field's invalid state as the patient corrects it.
  document.getElementById('intakeForm').addEventListener('input', function (ev) {
    var f = ev.target.closest('.field, .consent-block');
    if (f && f.classList.contains('invalid')) clearInvalid(f);
    if (ev.target.name === 'consent_treat' || ev.target.name === 'consent_privacy') {
      var stepEl = steps['4'];
      stepEl.querySelector('[data-name="' + ev.target.name + '"]').classList.remove('invalid');
      stepEl.querySelector('[data-name="' + ev.target.name + '_err"]').classList.remove('invalid');
    }
  });

  /* ---- Next / Back --------------------------------------------------- */
  document.querySelectorAll('[data-next]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!validateStep(current)) {
        emit('intake_step_blocked', { step: current });
        var firstErr = steps[String(current)].querySelector('.invalid');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (current < TOTAL) showStep(current + 1);
    });
  });
  document.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (current > 1) showStep(current - 1);
    });
  });

  /* ---- Photo upload -------------------------------------------------- */
  var MAX_BYTES = 10 * 1024 * 1024;
  var files = { insurance_card: null, gov_id: null };

  document.querySelectorAll('input[data-upload]').forEach(function (input) {
    var key = input.getAttribute('data-upload');
    var wrap = input.closest('.upload');
    var fieldEl = input.closest('.field');
    var img = wrap.querySelector('.u-preview img');
    var fname = wrap.querySelector('.u-fname');

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        setInvalid(fieldEl, 'That file is larger than 10 MB. Please choose a smaller photo.');
        input.value = '';
        return;
      }
      if (!/^image\//.test(file.type)) {
        setInvalid(fieldEl, 'Please choose an image file.');
        input.value = '';
        return;
      }
      clearInvalid(fieldEl);
      files[key] = file;
      fname.textContent = file.name;
      wrap.classList.add('has-file');
      var reader = new FileReader();
      reader.onload = function (e) { img.src = e.target.result; };
      reader.readAsDataURL(file);
      emit('intake_photo_attached', { kind: key });
    });
  });

  /* ---- Collect payload ---------------------------------------------- */
  function collect() {
    var form = document.getElementById('intakeForm');
    function val(name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    }
    var conditions = [];
    form.querySelectorAll('input[name="condition"]:checked').forEach(function (c) {
      conditions.push(c.value);
    });
    return {
      full_name: val('full_name'),
      date_of_birth: val('date_of_birth') || null,
      phone: val('phone'),
      email: val('email') || null,
      address_line: val('address_line'),
      address_city: val('address_city'),
      address_postcode: val('address_postcode') || null,
      insurance_provider: val('insurance_provider') || null,
      insurance_member_id: val('insurance_member_id') || null,
      insurance_group_no: val('insurance_group_no') || null,
      reason_for_visit: val('reason_for_visit'),
      history: {
        allergies: val('allergies') || null,
        medications: val('medications') || null,
        conditions: conditions
      },
      consent_treat: form.querySelector('[name="consent_treat"]').checked,
      consent_privacy: form.querySelector('[name="consent_privacy"]').checked,
      // Per-clinic intake links (v2). A clinic operator shares
      // frontdesk.nomoi.ai/?clinic=<slug>; the slug is captured here and
      // written into source_link_id so the clinic view can filter by it.
      // ?link= is kept as a fallback for any v1 links already in use.
      // No param present means a generic intake and the column stays null.
      source_link_id: clinicSlug(),
      user_agent: navigator.userAgent
    };
  }

  /* ---- Upload a photo to Storage ------------------------------------ */
  function uploadPhoto(file, prefix) {
    if (!file || !sb) return Promise.resolve(null);
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    var path = prefix + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    return sb.storage.from(CFG.BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false
    }).then(function (res) {
      if (res.error) throw res.error;
      return path;
    });
  }

  /* ---- Submit -------------------------------------------------------- */
  var submitBtn = document.getElementById('submitBtn');
  var submitErr = document.getElementById('submitErr');

  document.getElementById('intakeForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!validateStep(4)) {
      var firstErr = steps['4'].querySelector('.invalid');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submitErr.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    emit('intake_submit_start', {});

    var payload = collect();

    // Demo mode — no Supabase configured.
    if (!sb) {
      window.setTimeout(function () {
        finish('DEMO-' + Date.now().toString(36).toUpperCase().slice(-6));
      }, 600);
      return;
    }

    // The intake id is generated client-side and supplied in the insert.
    // The anon key is INSERT-only by design (RLS) — it cannot read a row
    // back, so the submit must not chain a .select(); doing so fails with
    // "permission denied". We already know the id because we minted it.
    var intakeId = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
    payload.id = intakeId;

    Promise.all([
      uploadPhoto(files.insurance_card, 'insurance'),
      uploadPhoto(files.gov_id, 'govid')
    ]).then(function (paths) {
      payload.insurance_card_path = paths[0];
      payload.gov_id_path = paths[1];
      return sb.from(CFG.TABLE).insert(payload);
    }).then(function (res) {
      if (res.error) throw res.error;
      emit('intake_submit_success', { intake_id: intakeId });
      finish(shortRef(intakeId));
    }).catch(function (err) {
      emit('intake_submit_error', { message: String(err && err.message || err) });
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit intake';
      submitErr.textContent =
        'We could not save your intake just now. Please check your connection and try again. ' +
        'If it keeps happening, you can complete it at the front desk.';
      submitErr.style.display = 'block';
    });
  });

  function shortRef(uuid) {
    return 'FD-' + String(uuid).replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  function finish(ref) {
    document.getElementById('introCard').hidden = true;
    document.querySelector('.progress').style.display = 'none';
    document.getElementById('intakeForm').hidden = true;
    var done = document.getElementById('doneCard');
    done.hidden = false;
    document.getElementById('doneRef').textContent = 'Reference ' + ref;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---- Init ---------------------------------------------------------- */
  renderProgress();
})();
