// Registration Help page: interactive checklist with a progress bar.
// Checked steps are saved in the browser (localStorage) so they stay after a refresh.

const checkboxes = document.querySelectorAll('.checklist input[type="checkbox"]');
const progressText = document.querySelector('#progress-text');
const progressFill = document.querySelector('#progress-fill');
const resetButton = document.querySelector('#reset-checklist');
const STORAGE_KEY = 'registrationChecklist';

// Read saved steps. Wrapped in try/catch because some browsers block storage.
function loadSavedSteps() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveSteps() {
  const doneSteps = [];
  checkboxes.forEach((box) => {
    if (box.checked) doneSteps.push(box.dataset.step);
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doneSteps));
  } catch (error) {
    // Storage not available, the checklist still works for this visit.
  }
}

// Update the "X of 8 steps done" text, the bar, and the crossed out style.
function updateProgress() {
  let doneCount = 0;

  checkboxes.forEach((box) => {
    box.closest('li').classList.toggle('done', box.checked);
    if (box.checked) doneCount++;
  });

  const total = checkboxes.length;
  progressText.textContent = doneCount === total
    ? `All ${total} steps done. You are ready to register!`
    : `${doneCount} of ${total} steps done`;
  progressFill.style.width = `${(doneCount / total) * 100}%`;
}

if (checkboxes.length) {
  const savedSteps = loadSavedSteps();

  checkboxes.forEach((box) => {
    box.checked = savedSteps.includes(box.dataset.step);
    box.addEventListener('change', () => {
      saveSteps();
      updateProgress();
    });
  });

  resetButton.addEventListener('click', () => {
    checkboxes.forEach((box) => { box.checked = false; });
    saveSteps();
    updateProgress();
  });

  updateProgress();
}
