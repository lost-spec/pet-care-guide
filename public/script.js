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
const sourcesSection = document.getElementById('sources-section');
const sourcesGrid = document.getElementById('sources-grid');
const sourcesLoading = document.getElementById('sources-loading');
const sourcesError = document.getElementById('sources-error');

let lastRequest = { petType: '', breed: '', location: '' };

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  btnText.textContent = isLoading ? 'Loading...' : 'Get Care Info';
  spinner.classList.toggle('hidden', !isLoading);
  formError.classList.add('hidden');
}

function setSourcesLoading(isLoading) {
  sourcesLoading.classList.toggle('hidden', !isLoading);
  sourcesGrid.classList.toggle('hidden', isLoading);
  sourcesError.classList.add('hidden');
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

function renderSources(shops) {
  if (!shops || shops.length === 0) {
    sourcesGrid.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:2rem;">No sources found. Try a different location or check local shelters.</p>';
    return;
  }
  
  sourcesGrid.innerHTML = shops.map(shop => {
    const hasRating = shop.rating !== null && shop.rating !== undefined;
    const typeClass = shop.type || 'organic';
    return `
      <article class="source-card">
        <div class="source-header">
          <h3 class="source-name">${escapeHtml(shop.name || 'Unknown')}</h3>
          <span class="source-type ${typeClass}">${typeClass}</span>
        </div>
        ${shop.address ? `<p class="source-address">📍 ${escapeHtml(shop.address)}</p>` : ''}
        ${shop.phone ? `<p class="source-phone">📞 ${escapeHtml(shop.phone)}</p>` : ''}
        ${hasRating ? `<p class="source-rating"><span class="stars">${'★'.repeat(Math.round(shop.rating))}${'☆'.repeat(5 - Math.round(shop.rating))}</span> ${shop.rating.toFixed(1)} ${shop.reviews ? `(${shop.reviews} reviews)` : ''}</p>` : ''}
        ${shop.price_range ? `<p class="source-price">💰 ${escapeHtml(shop.price_range)}</p>` : ''}
        ${shop.snippet ? `<p class="source-snippet">${escapeHtml(shop.snippet)}</p>` : ''}
        ${shop.url ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noopener noreferrer" class="source-link">View Details →</a>` : ''}
      </article>
    `;
  }).join('');
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

async function fetchPetSources(petType, breed, location) {
  const response = await fetch('/api/pet-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ petType, breed, location })
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
  const location = document.getElementById('location').value.trim();
  
  if (!petType || !breed) {
    formError.textContent = 'Please select a pet type and enter a breed';
    formError.classList.remove('hidden');
    return;
  }
  
  lastRequest = { petType, breed, location };
  setLoading(true);
  errorState.classList.add('hidden');
  results.classList.add('hidden');
  sourcesSection.classList.add('hidden');
  
  try {
    const data = await fetchPetInfo(petType, breed);
    showResults(data);
    
    // Fetch sources after showing care info
    sourcesSection.classList.remove('hidden');
    setSourcesLoading(true);
    
    try {
      const sourcesData = await fetchPetSources(petType, breed, location);
      renderSources(sourcesData.shops || []);
    } catch (sourceError) {
      console.error('Sources error:', sourceError);
      sourcesError.textContent = sourceError.message || 'Could not load sources. Try again later.';
      sourcesError.classList.remove('hidden');
      sourcesGrid.innerHTML = '';
    } finally {
      setSourcesLoading(false);
    }
    
  } catch (error) {
    console.error('Error:', error);
    
    const msg = error.data?.error || error.message || 'Unknown error';
    
    if (error.status === 400) {
      formError.textContent = msg;
      formError.classList.remove('hidden');
    } else if (error.status === 404) {
      showError(msg, 'Unknown Breed');
    } else {
      showError(`Server error: ${msg}`);
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
    document.getElementById('location').value = lastRequest.location || '';
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