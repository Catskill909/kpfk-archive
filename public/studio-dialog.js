/* In-app confirmation for the studio (Paul, 2026-09-28: "never the default browser
 * pop-up"). StudioDialog.confirm({title, message, confirmLabel, cancelLabel}) returns a
 * Promise<boolean>. Styled with the studio's own colours (light and dark); Escape, Cancel
 * or a click outside cancel; focus starts on Cancel so Enter never confirms by accident,
 * and returns to whatever was focused before. test/pacifica/no-browser-popups.test.js keeps
 * window.confirm / alert / prompt out of the app. */
(function () {
  'use strict';
  var dlg = null;
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'studio-dialog';
    dlg.setAttribute('aria-labelledby', 'studioDialogTitle');
    dlg.setAttribute('aria-describedby', 'studioDialogText');
    dlg.innerHTML =
      '<h2 class="studio-dialog-title" id="studioDialogTitle"></h2>' +
      '<p class="studio-dialog-text" id="studioDialogText"></p>' +
      '<div class="studio-dialog-actions">' +
        '<button type="button" class="studio-btn studio-btn--quiet" data-answer="no"></button>' +
        '<button type="button" class="studio-btn studio-dialog-confirm" data-answer="yes"></button>' +
      '</div>';
    document.body.appendChild(dlg);
  }
  function ask(opts) {
    if (!dlg) build();
    var back = document.activeElement;
    dlg.querySelector('#studioDialogTitle').textContent = opts.title || 'Are you sure?';
    dlg.querySelector('#studioDialogText').textContent = opts.message || '';
    dlg.querySelector('[data-answer="yes"]').textContent = opts.confirmLabel || 'Continue';
    dlg.querySelector('[data-answer="no"]').textContent = opts.cancelLabel || 'Cancel';
    return new Promise(function (resolve) {
      function done(answer) {
        dlg.removeEventListener('click', onClick);
        dlg.removeEventListener('cancel', onCancel);
        dlg.close();
        if (back && back.focus) back.focus();
        resolve(answer);
      }
      function onClick(e) {
        var b = e.target.closest('[data-answer]');
        if (b) return done(b.dataset.answer === 'yes');
        if (e.target === dlg) done(false);   // the backdrop area around the card
      }
      function onCancel(e) { e.preventDefault(); done(false); }   // Escape
      dlg.addEventListener('click', onClick);
      dlg.addEventListener('cancel', onCancel);
      dlg.showModal();
      dlg.querySelector('[data-answer="no"]').focus();
    });
  }
  window.StudioDialog = { confirm: ask };
})();
