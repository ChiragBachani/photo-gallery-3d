// Thin DOM layer: loading screen, start menu, HUD, captions, CTA overlay.

const $ = (id) => document.getElementById(id);

export const els = {
  loading: $('loading'), loadBar: $('load-bar'), loadNote: $('load-note'),
  start: $('start'), startTour: $('start-tour'), startExplore: $('start-explore'), startHint: $('start-hint'),
  roomChip: $('room-chip'), caption: $('caption'), hint: $('hint'),
  tourBtn: $('tour-btn'), exitTourBtn: $('exit-tour-btn'), crosshair: $('crosshair'),
  cta: $('cta'), ctaClose: $('cta-close'),
};

export function setLoadProgress(f) {
  els.loadBar.style.width = `${Math.round(f * 100)}%`;
}

export function showStart(isTouch) {
  els.loading.classList.add('hidden');
  els.start.classList.remove('hidden');
  if (isTouch) {
    els.startHint.innerHTML = 'Use the joystick to walk · drag anywhere to look around · tap a photo to view it up close';
  }
}
export function hideStart() { els.start.classList.add('hidden'); }

let hintTimer = null;
export function showHint(text, ms = 5200) {
  els.hint.innerHTML = text;
  els.hint.style.opacity = 1;
  els.caption.style.opacity = 0;
  clearTimeout(hintTimer);
  if (ms) hintTimer = setTimeout(() => { els.hint.style.opacity = 0; }, ms);
}
export function hideHint() { clearTimeout(hintTimer); els.hint.style.opacity = 0; }

export function setCaption(text, counter = '') {
  if (!text) { els.caption.style.opacity = 0; return; }
  hideHint();
  els.caption.querySelector('.text').textContent = text;
  els.caption.querySelector('.counter').textContent = counter;
  els.caption.querySelector('.counter').style.display = counter ? 'block' : 'none';
  els.caption.style.opacity = 1;
}

export function setRoomChip(text) {
  if (els.roomChip.textContent !== text) els.roomChip.textContent = text;
}

export function setMode(mode) {
  // mode: 'start' | 'free' | 'tour' | 'focus'
  els.tourBtn.style.display = mode === 'free' ? 'block' : 'none';
  els.exitTourBtn.style.display = mode === 'tour' ? 'block' : 'none';
  els.crosshair.style.opacity = mode === 'free' ? 1 : 0;
  if (mode !== 'tour' && mode !== 'focus') setCaption(null);
}

export function showCTA() { els.cta.classList.remove('hidden'); }
export function hideCTA() { els.cta.classList.add('hidden'); }
