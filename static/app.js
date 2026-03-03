(function () {
  'use strict';

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxBackdrop = lightbox && lightbox.querySelector('.lightbox-backdrop');
  const lightboxClose = lightbox && lightbox.querySelector('.lightbox-close');

  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmCancel = document.getElementById('confirm-cancel');
  const confirmOk = document.getElementById('confirm-ok');

  const selectAllCheckbox = document.getElementById('select-all');
  const deleteSelectedBtn = document.getElementById('delete-selected');
  const selectedCountSpan = document.getElementById('selected-count');

  // ----- Lightbox -----
  const lightboxFilename = document.getElementById('lightbox-filename');

  function openLightbox(src, path) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    if (lightboxFilename) {
      var name = path ? path.replace(/^.*[/\\]/, '') : '';
      lightboxFilename.textContent = name;
    }
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    lightboxImg.src = '';
    if (lightboxFilename) lightboxFilename.textContent = '';
    document.body.style.overflow = '';
  }

  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (confirmDialog && !confirmDialog.hidden) {
        confirmDialog.hidden = true;
      } else {
        closeLightbox();
      }
    }
  });

  // Prevent checkbox/label from opening lightbox
  document.querySelector('.main') && document.querySelector('.main').addEventListener('click', function (e) {
    if (e.target.closest('.card-checkbox') || e.target.closest('.card-actions')) return;
    const wrap = e.target.closest('.card-thumb-wrap');
    if (!wrap) return;
    const card = wrap.closest('.card');
    if (!card) return;
    const path = card.dataset.path;
    const album = card.dataset.album;
    if (!path || !album) return;
    const src = '/view?album=' + encodeURIComponent(album) + '&path=' + encodeURIComponent(path);
    openLightbox(src, path);
  });

  // ----- Confirm dialog (promise-based) -----
  function confirm(options) {
    return new Promise(function (resolve) {
      if (!confirmDialog || !confirmTitle || !confirmMessage || !confirmCancel || !confirmOk) {
        resolve(false);
        return;
      }
      confirmTitle.textContent = options.title || 'Confirm';
      confirmMessage.textContent = options.message || '';
      confirmDialog.hidden = false;

      function done(value) {
        confirmDialog.hidden = true;
        confirmCancel.removeEventListener('click', onCancel);
        confirmOk.removeEventListener('click', onOk);
        confirmDialog.querySelector('.modal-backdrop').removeEventListener('click', onCancel);
        resolve(value);
      }

      function onCancel() { done(false); }
      function onOk() { done(true); }

      confirmCancel.addEventListener('click', onCancel);
      confirmOk.addEventListener('click', onOk);
      confirmDialog.querySelector('.modal-backdrop').addEventListener('click', onCancel);
    });
  }

  // ----- Single delete -----
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.btn-delete');
    if (!btn) return;
    e.preventDefault();
    const path = btn.dataset.path;
    const album = btn.dataset.album;
    if (!path || !album) return;

    confirm({ title: 'Delete this photo?', message: 'This cannot be undone.' }).then(function (ok) {
      if (!ok) return;
      fetch('/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'album=' + encodeURIComponent(album) + '&path=' + encodeURIComponent(path)
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            const card = btn.closest('.card');
            if (card) card.remove();
          } else {
            alert(data.error || 'Delete failed');
          }
        })
        .catch(function () { alert('Delete failed'); });
    });
  });

  // ----- Fav -----
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.btn-fav');
    if (!btn) return;
    e.preventDefault();
    const path = btn.dataset.path;
    if (!path) return;

    fetch('/fav', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'path=' + encodeURIComponent(path)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          const card = btn.closest('.card');
          if (card) card.remove();
        } else {
          alert(data.error || 'Failed to add to favorites');
        }
      })
      .catch(function () { alert('Failed to add to favorites'); });
  });

  // ----- Multiselect (Recent tab) -----
  function getPhotoCheckboxes() {
    return Array.prototype.slice.call(document.querySelectorAll('.photo-checkbox'));
  }

  function updateSelectedState() {
    const checkboxes = getPhotoCheckboxes();
    const count = checkboxes.filter(function (c) { return c.checked; }).length;
    if (selectedCountSpan) selectedCountSpan.textContent = count;
    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = count === 0;
    }
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = count > 0 && count === checkboxes.length;
      selectAllCheckbox.indeterminate = count > 0 && count < checkboxes.length;
    }
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', function () {
      getPhotoCheckboxes().forEach(function (cb) {
        cb.checked = selectAllCheckbox.checked;
      });
      updateSelectedState();
    });
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('photo-checkbox')) {
      updateSelectedState();
    }
  });

  // Bulk delete selected
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', function () {
      const checkboxes = getPhotoCheckboxes().filter(function (c) { return c.checked; });
      if (checkboxes.length === 0) return;

      const paths = checkboxes.map(function (c) {
        const card = c.closest('.card');
        return card ? card.dataset.path : null;
      }).filter(Boolean);

      const album = document.querySelector('.card[data-album]');
      const albumName = album ? album.dataset.album : 'recent';

      const n = paths.length;
      confirm({
        title: 'Delete ' + n + ' photo(s)?',
        message: 'This cannot be undone.'
      }).then(function (ok) {
        if (!ok) return;
        fetch('/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ album: albumName, paths: paths })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.ok !== false && data.deleted > 0) {
              const pathSet = new Set(paths);
              document.querySelectorAll('.card').forEach(function (card) {
                if (pathSet.has(card.dataset.path)) card.remove();
              });
              updateSelectedState();
            }
            if (data.errors && data.errors.length) {
              alert('Some files could not be deleted: ' + data.errors.length);
            }
          })
          .catch(function () { alert('Delete failed'); });
      });
    });
  }

  updateSelectedState();
})();
