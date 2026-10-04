// Pet Care Guide - Frontend JavaScript

const form = document.getElementById('pet-form');
const submitBtn = document.getElementById('submit-btn');
const btnText = submitBtn.querySelector('.btn-text');
const spinner = submitBtn.querySelector('.spinner');
const formError = document.getElementById('form-error');
const results = document.getElementById('results');
const errorState = document.getElementById('error-state');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const summaryEl = document.getElementById('summary');
const feedingKeypoints = document.getElementById('feeding-keypoints');
const feedingDetails = document.getElementById('feeding-details');
const environmentKeypoints = document.getElementById('environment-keypoints');
const environmentDetails = document.getElementById('environment-details');
const warningsEl = document.getElementById('warnings');
const warningsList = document.getElementById('warnings-list');

let lastRequest = { petType: '', breed: '' };

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  btnText.textContent = isLoading ? 'Loading...' : 'Get Care Info';
  spinner.classList.toggle('hidden', !isLoading);
  formError.classList.add('hidden');
}

function showError(message, title = 'Something went wrong') {
  results.classList.add('hidden');
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  errorState.classList.remove('hidden');
}

function showResults(data) {
  errorState.classList.add('hidden');
  
  // Summary
  summaryEl.textContent = data.summary || '';
  
  // Feeding
  renderKeypoints(feedingKeypoints, data.feeding?.keyPoints || []);
  feedingDetails.textContent = data.feeding?.details || '';
  feedingDetails.classList.add('hidden');
  document.querySelector('[data-target="feeding-details"]').setAttribute('aria-expanded', 'false');
  
  // Environment
  renderKeypoints(environmentKeypoints, data.environment?.keyPoints || []);
  environmentDetails.textContent = data.environment?.details || '';
  environmentDetails.classList.add('hidden');
  document.querySelector('[data-target="environment-details"]').setAttribute('aria-expanded', 'false');
  
  // Warnings
  if (data.warnings && data.warnings.length > 0) {
    warningsList.innerHTML = data.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('');
    warningsEl.classList.remove('hidden');
  } else {
    warningsEl.classList.add('hidden');
  }
  
  results.classList.remove('hidden');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderKeypoints(container, keypoints) {
  container.innerHTML = (keypoints || []).map(kp => `
    <div class="keypoint-card">
      <div class="keypoint-label">${escapeHtml(kp.label || '')}</div>
      <div class="keypoint-value">${escapeHtml(kp.value || '')}</div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function fetchPetInfo(petType, breed) {
  const response = await fetch('/api/pet-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ petType, breed })
  });
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  
  return data;
}

async function handleSubmit(event) {
  event.preventDefault();
  
  const petType = document.getElementById('pet-type').value.trim();
  const breed = document.getElementById('breed').value.trim();
  
  if (!petType || !breed) {
    formError.textContent = 'Please select a pet type and enter a breed';
    formError.classList.remove('hidden');
    return;
  }
  
  lastRequest = { petType, breed };
  setLoading(true);
  errorState.classList.add('hidden');
  results.classList.add('hidden');
  
  try {
    const data = await fetchPetInfo(petType, breed);
    showResults(data);
  } catch (error) {
    console.error('Error:', error);
    
    if (error.status === 400) {
      formError.textContent = error.data?.error || 'Invalid input. Please check your entries.';
      formError.classList.remove('hidden');
    } else if (error.status === 404) {
      showError('This breed was not recognized. Please check the spelling and try again.', 'Unknown Breed');
    } else {
      showError('Unable to fetch care information. Please check your connection and try again.');
    }
  } finally {
    setLoading(false);
  }
}

function handleReadMore(event) {
  const btn = event.currentTarget;
  const targetId = btn.dataset.target;
  const details = document.getElementById(targetId);
  const isExpanded = btn.getAttribute('aria-expanded') === 'true';
  
  btn.setAttribute('aria-expanded', !isExpanded);
  btn.querySelector('.read-more-text').textContent = isExpanded ? 'Read more' : 'Show less';
  details.classList.toggle('hidden', isExpanded);
}

function handleRetry() {
  if (lastRequest.petType && lastRequest.breed) {
    document.getElementById('pet-type').value = lastRequest.petType;
    document.getElementById('breed').value = lastRequest.breed;
    handleSubmit(new Event('submit'));
  }
}

// Event listeners
form.addEventListener('submit', handleSubmit);
retryBtn.addEventListener('click', handleRetry);

document.querySelectorAll('.btn-read-more').forEach(btn => {
  btn.addEventListener('click', handleReadMore);
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('Pet Care Guide initialized');
  document.getElementById('pet-type').focus();
});