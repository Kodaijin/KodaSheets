/**
 * Koda Sheets - Tab Wiring (Step 4)
 *
 * Binds the #tabFront / #tabBack buttons to the grid renderer.
 * Also sets a data-view attribute on #grid so CSS can style the back view
 * differently if desired.
 */

import { setView } from './grid.js';

/**
 * Wire the Front / Back tab buttons.
 * Must be called after DOMContentLoaded.
 */
export function initTabs() {
  const tabFront = document.getElementById('tabFront');
  const tabBack  = document.getElementById('tabBack');

  if (!tabFront || !tabBack) {
    console.warn('initTabs: could not find tab buttons (#tabFront / #tabBack)');
    return;
  }

  tabFront.addEventListener('click', () => {
    _activate(tabFront, tabBack);
    setView('front');
  });

  tabBack.addEventListener('click', () => {
    _activate(tabBack, tabFront);
    setView('back');
  });
}

/**
 * Apply the `active` class to the clicked tab and remove it from the other.
 *
 * @param {HTMLElement} activeBtn
 * @param {HTMLElement} inactiveBtn
 */
function _activate(activeBtn, inactiveBtn) {
  activeBtn.classList.add('active');
  inactiveBtn.classList.remove('active');
}
