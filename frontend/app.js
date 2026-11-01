/**
 * app.js - Mobile App Prototype Logic for Radio VN
 * Triển khai đầy đủ:
 * 1. Authentication Gate (Bắt buộc Đăng nhập/Đăng ký trước khi vào App)
 * 2. Onboarding Flow (Chuyển thẳng sang Tạo kênh mới sau khi đăng nhập lần đầu)
 * 3. Wizard 4 Bước (Prompt tự do & AI duyệt, Nguồn báo Whitelist, MC & Hình thức phát, AI Biên tập)
 * 4. Dashboard, Sticky Mini Player & Fullscreen Audio Player
 */

// Xác định API Base URL linh hoạt
const API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ? window.location.origin
  : 'http://localhost:8000';

// =============================================================================
// TRẠNG THÁI ỨNG DỤNG TOÀN CỤC (APPLICATION STATE)
// =============================================================================
const state = {
  // Người dùng hiện tại (Lấy từ localStorage hoặc null nếu chưa đăng nhập)
  user: JSON.parse(localStorage.getItem('radiovn_user')) || null,
  token: localStorage.getItem('radiovn_token') || null,
  isOnboarded: localStorage.getItem('radiovn_onboarded') === 'true',

  // Tab màn hình hiện tại ('screenHome' | 'screenMyChannels' | 'screenProfile')
  activeTab: 'screenHome',

  // Danh sách kênh & bộ lọc
  channels: [],
  filter: 'all',
  searchQuery: '',
  homeQuickTag: 'all',

  // Kênh & Bản tin đang phát sóng
  activeChannel: null,
  activeBroadcast: null,
  isPlaying: false,
  currentTime: 0,
  duration: 180,
  playbackSpeed: 1.0,
  volume: 0.8,
  isMuted: false,

  // Trạng thái Wizard 4 bước
  wizard: {
    currentStep: 1,
    channelName: '',
    prompt: '',
    isPromptValidated: false,
    topic: 'cong-nghe',
    topicLabel: 'Công Nghệ & AI',
    tone: 'Sôi nổi',
    contentType: 'continuous',
    sources: [],
    broadcastMode: 'live', // Chọn duy nhất tại Bước 3
    voiceCode: 'vi-VN-MinhQuan',
    voiceName: 'Minh Quân (Nam - Giọng Bắc)',
    previewData: null
  },

  voicesCatalog: []
};

// =============================================================================
// WEB AUDIO & SPEECH SYNTHESIS ENGINE (KHÔNG DÙNG API NGOÀI TÍNH PHÍ)
// =============================================================================
class RadioAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.speechSynth = window.speechSynthesis;
    this.timerInterval = null;
    this.chunks = [];
    this.currentChunkIndex = 0;
    this.isSpeaking = false;
    this.onEndCallback = null;
    this.heartbeatTimer = null;

    if (this.speechSynth && this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = () => {
        this.getVietnameseVoice();
      };
    }
  }

  getVietnameseVoice() {
    if (!this.speechSynth) return null;
    const voices = this.speechSynth.getVoices();
    const vnVoice = voices.find(v => v.lang && (v.lang.toLowerCase().includes('vi') || v.lang.toLowerCase().includes('vn')));
    return vnVoice || null;
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playRadioJingle() {
    try {
      this.initAudioContext();
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // Hợp âm Chime Radio 3 nốt: C5 -> E5 -> G5
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);

        gain.gain.setValueAtTime(0, now + idx * 0.15);
        gain.gain.linearRampToValueAtTime(0.18 * state.volume, now + idx * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.6);
      });
    } catch (e) {
      console.warn('AudioContext Jingle warning:', e);
    }
  }

  speakText(text, onEndCallback) {
    if (!this.speechSynth) return;
    this.stop();

    this.onEndCallback = onEndCallback;
    this.isSpeaking = true;

    const cleanedText = text
      .replace(/\[SFX:[^\]]+\]/g, ' ')
      .replace(/KÊNH:[^\n]+/g, ' ')
      .replace(/ĐÀI PHÁT THANH[^\n]+/g, ' ')
      .trim();

    // Chia kịch bản phát thanh dài (400-600 từ) thành các câu ngắn để chống lỗi timeout 15s của trình duyệt
    const rawChunks = cleanedText.match(/[^.?!;\n]+[.?!;\n]+|[^.?!;\n]+$/g) || [cleanedText];
    this.chunks = rawChunks.map(c => c.trim()).filter(c => c.length > 0);
    this.currentChunkIndex = 0;

    // Heartbeat định kỳ giữ cho SpeechSynthesis không bị Chrome thu hồi rác giữa chừng
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.speechSynth && this.isSpeaking && !this.speechSynth.paused) {
        this.speechSynth.pause();
        this.speechSynth.resume();
      }
    }, 9000);

    this.speakNextChunk();
  }

  speakNextChunk() {
    if (!this.isSpeaking || this.currentChunkIndex >= this.chunks.length) {
      this.isSpeaking = false;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      if (this.onEndCallback) this.onEndCallback();
      return;
    }

    const chunk = this.chunks[this.currentChunkIndex];
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = state.playbackSpeed;
    utterance.volume = state.isMuted ? 0 : state.volume;

    const vnVoice = this.getVietnameseVoice();
    if (vnVoice) {
      utterance.voice = vnVoice;
    } else {
      utterance.lang = 'vi-VN';
    }

    if (state.activeChannel && state.activeChannel.voice_name && state.activeChannel.voice_name.includes('Nữ')) {
      utterance.pitch = 1.15;
    } else {
      utterance.pitch = 0.95;
    }

    utterance.onend = () => {
      if (this.isSpeaking) {
        this.currentChunkIndex++;
        this.speakNextChunk();
      }
    };

    utterance.onerror = (e) => {
      console.warn('Speech chunk notification:', e);
      if (this.isSpeaking) {
        this.currentChunkIndex++;
        this.speakNextChunk();
      }
    };

    this.speechSynth.speak(utterance);
  }

  pause() {
    if (this.speechSynth && this.isSpeaking) {
      this.speechSynth.pause();
    }
  }

  resume() {
    if (this.speechSynth && this.speechSynth.paused) {
      this.speechSynth.resume();
    }
  }

  stop() {
    this.isSpeaking = false;
    this.chunks = [];
    this.currentChunkIndex = 0;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.speechSynth) {
      this.speechSynth.cancel();
    }
  }
}

const audioEngine = new RadioAudioEngine();

// =============================================================================
// CANVAS AUDIO VISUALIZER (SÓNG ÂM THANH TRỰC TIẾP TRÊN MÀN HÌNH PLAYER)
// =============================================================================
let visualizerAnimationId = null;

function initCanvasVisualizer() {
  const canvas = document.getElementById('visualizerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  let phase = 0;

  function renderWave() {
    ctx.clearRect(0, 0, width, height);

    const barCount = 28;
    const barWidth = 4;
    const gap = (width - barCount * barWidth) / (barCount - 1);

    for (let i = 0; i < barCount; i++) {
      let barHeight;
      if (state.isPlaying) {
        const wave1 = Math.sin(phase + i * 0.3);
        const wave2 = Math.cos(phase * 1.6 + i * 0.25);
        const intensity = Math.abs(wave1 * wave2);
        barHeight = Math.max(5, intensity * (height - 6));
      } else {
        barHeight = 5;
      }

      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(1, '#818cf8');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }

    if (state.isPlaying) {
      phase += 0.08 * state.playbackSpeed;
    }

    visualizerAnimationId = requestAnimationFrame(renderWave);
  }

  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
  }
  renderWave();
}

// =============================================================================
// TOAST NOTIFICATIONS
// =============================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    info: 'border-sky-500 bg-slate-900/95 text-sky-300',
    success: 'border-emerald-500 bg-slate-900/95 text-emerald-300',
    warning: 'border-amber-500 bg-slate-900/95 text-amber-300',
    error: 'border-rose-500 bg-slate-900/95 text-rose-300'
  };

  const icons = {
    info: 'info',
    success: 'check-circle-2',
    warning: 'alert-triangle',
    error: 'alert-circle'
  };

  toast.className = `flex items-center gap-2 px-3.5 py-2.5 rounded-xl border shadow-2xl text-xs font-semibold backdrop-blur-md pointer-events-auto transition-all duration-300 ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0"></i>
    <span class="truncate">${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// =============================================================================
// REAL-TIME MOBILE CLOCK
// =============================================================================
function updateMobileClock() {
  const clockEl = document.getElementById('mobileClock');
  if (!clockEl) return;
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  clockEl.textContent = `${hours}:${minutes}`;

  const greetingDateEl = document.getElementById('greetingDate');
  if (greetingDateEl) {
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    greetingDateEl.textContent = `${day}/${month}/${year}`;
  }
}
setInterval(updateMobileClock, 10000);

// =============================================================================
// AUTHENTICATION GATE & ONBOARDING CONTROLLER
// =============================================================================
let gateAuthMode = 'login'; // 'login' | 'register'

function checkAuthState(isInitialLoad = false) {
  const gateScreen = document.getElementById('screenAuthGate');
  const mainWrapper = document.getElementById('mainAppWrapper');

  if (!state.user) {
    // 1. CHƯA ĐĂNG NHẬP: Bắt buộc ở màn hình Auth Gate
    if (gateScreen) gateScreen.classList.remove('hidden');
    if (mainWrapper) mainWrapper.classList.add('hidden');
    audioEngine.stop();
    state.isPlaying = false;
  } else {
    // 2. ĐÃ ĐĂNG NHẬP: Vào ứng dụng chính
    if (gateScreen) gateScreen.classList.add('hidden');
    if (mainWrapper) mainWrapper.classList.remove('hidden');
    updateUserUI();

    // 2. LUỒNG TẠO KÊNH LẦN ĐẦU (ONBOARDING FLOW)
    // Nếu vừa đăng nhập và chưa từng tạo kênh (hoặc chưa onboard), chuyển thẳng vào màn hình Tạo kênh mới
    if (!state.isOnboarded) {
      const banner = document.getElementById('onboardingBanner');
      if (banner) banner.classList.remove('hidden');
      openWizardModal();
    } else {
      switchTab('screenHome');
      fetchChannels();
    }
  }
}

function setGateAuthMode(mode) {
  gateAuthMode = mode;
  const tabLogin = document.getElementById('gateTabLogin');
  const tabReg = document.getElementById('gateTabRegister');
  const fieldName = document.getElementById('gateFieldFullName');
  const fieldEmail = document.getElementById('gateFieldEmail');
  const submitText = document.getElementById('gateSubmitBtnText');
  const alertEl = document.getElementById('gateAlert');

  if (alertEl) alertEl.classList.add('hidden');

  if (mode === 'login') {
    tabLogin.className = 'flex-1 py-2 rounded-xl bg-sky-500 text-white transition text-center shadow-md font-bold';
    tabReg.className = 'flex-1 py-2 rounded-xl text-slate-400 hover:text-white transition text-center font-bold';
    if (fieldName) fieldName.classList.add('hidden');
    if (fieldEmail) fieldEmail.classList.add('hidden');
    if (submitText) submitText.textContent = 'Đăng Nhập Ngay';
  } else {
    tabReg.className = 'flex-1 py-2 rounded-xl bg-sky-500 text-white transition text-center shadow-md font-bold';
    tabLogin.className = 'flex-1 py-2 rounded-xl text-slate-400 hover:text-white transition text-center font-bold';
    if (fieldName) fieldName.classList.remove('hidden');
    if (fieldEmail) fieldEmail.classList.remove('hidden');
    if (submitText) submitText.textContent = 'Tạo Tài Khoản Mới';
  }
}

async function handleGateAuthSubmit() {
  const username = document.getElementById('gateInputUsername').value.trim();
  const password = document.getElementById('gateInputPassword').value.trim();
  const fullName = document.getElementById('gateInputFullName')?.value.trim();
  const email = document.getElementById('gateInputEmail')?.value.trim();
  const alertEl = document.getElementById('gateAlert');

  if (!username || !password) {
    if (alertEl) {
      alertEl.textContent = 'Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.';
      alertEl.classList.remove('hidden');
    }
    return;
  }

  try {
    let endpoint = (gateAuthMode === 'login') ? '/api/auth/login' : '/api/auth/register';
    let body = (gateAuthMode === 'login')
      ? { username, password }
      : { username, password, email: email || `${username}@radiovn.ai`, full_name: fullName || username };

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Thao tác không thành công');

    state.user = data.user;
    state.token = data.token;
    localStorage.setItem('radiovn_user', JSON.stringify(data.user));
    localStorage.setItem('radiovn_token', data.token);

    showToast(`Chào mừng ${data.user.full_name || data.user.username}!`, 'success');
    checkAuthState();

  } catch (err) {
    if (alertEl) {
      alertEl.textContent = err.message;
      alertEl.classList.remove('hidden');
    }
  }
}

function handleQuickDemoLogin() {
  document.getElementById('gateInputUsername').value = 'demo_user';
  document.getElementById('gateInputPassword').value = 'demo123';
  setGateAuthMode('login');
  handleGateAuthSubmit();
}

function handleLogout() {
  localStorage.removeItem('radiovn_user');
  localStorage.removeItem('radiovn_token');
  state.user = null;
  state.token = null;
  closeUserDropdown();
  showToast('Đã đăng xuất khỏi tài khoản.', 'info');
  checkAuthState();
}

// =============================================================================
// TOP BAR AVATAR DROPDOWN
// =============================================================================
let isUserDropdownOpen = false;

function toggleUserDropdown(forceState) {
  const menu = document.getElementById('userDropdownMenu');
  const chevron = document.getElementById('userChevron');
  if (!menu) return;

  if (typeof forceState === 'boolean') {
    isUserDropdownOpen = forceState;
  } else {
    isUserDropdownOpen = !isUserDropdownOpen;
  }

  if (isUserDropdownOpen) {
    menu.classList.remove('hidden');
    void menu.offsetWidth;
    menu.classList.remove('opacity-0', 'translate-y-2');
    menu.classList.add('opacity-100', 'translate-y-0');
    if (chevron) chevron.classList.add('rotate-180');
  } else {
    menu.classList.remove('opacity-100', 'translate-y-0');
    menu.classList.add('opacity-0', 'translate-y-2');
    if (chevron) chevron.classList.remove('rotate-180');
    setTimeout(() => {
      if (!isUserDropdownOpen) menu.classList.add('hidden');
    }, 200);
  }
}

function closeUserDropdown() {
  if (isUserDropdownOpen) toggleUserDropdown(false);
}

function updateUserUI() {
  const initialsEl = document.getElementById('userAvatarInitials');
  const greetingName = document.getElementById('greetingUserName');
  const dropdownName = document.getElementById('dropdownUserName');
  const dropdownEmail = document.getElementById('dropdownUserEmail');
  const profInitials = document.getElementById('profileAvatarInitials');
  const profName = document.getElementById('profileUserName');
  const profEmail = document.getElementById('profileUserEmail');

  if (state.user) {
    const name = state.user.full_name || state.user.username;
    const initials = name.substring(0, 2).toUpperCase();

    if (initialsEl) initialsEl.textContent = initials;
    if (greetingName) greetingName.textContent = name;
    if (dropdownName) dropdownName.textContent = name;
    if (dropdownEmail) dropdownEmail.textContent = state.user.email || `${state.user.username}@radiovn.ai`;
    if (profInitials) profInitials.textContent = initials;
    if (profName) profName.textContent = name;
    if (profEmail) profEmail.textContent = state.user.email || `${state.user.username}@radiovn.ai`;
  }
}

// =============================================================================
// TAB NAVIGATION CONTROLLER
// =============================================================================
function switchTab(targetScreenId, options = {}) {
  state.activeTab = targetScreenId;

  const screens = ['screenHome', 'screenMyChannels', 'screenProfile'];
  screens.forEach(s => {
    const el = document.getElementById(s);
    if (el) {
      if (s === targetScreenId) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    const target = btn.dataset.target;
    if (target === targetScreenId) {
      btn.className = 'nav-item active flex flex-col items-center gap-1 text-sky-400 transition';
    } else {
      btn.className = 'nav-item flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200 transition';
    }
  });

  // Tùy chọn kích hoạt bộ lọc cụ thể khi chuyển sang tab Kênh của tôi
  if (targetScreenId === 'screenMyChannels' && options.filter) {
    setMyChannelsFilter(options.filter);
  }

  const scrollArea = document.getElementById('mainScrollArea');
  if (scrollArea) scrollArea.scrollTop = 0;
}

function setMyChannelsFilter(filterKey = 'all') {
  state.filter = filterKey;
  document.querySelectorAll('.filter-tab').forEach(t => {
    if (t.dataset.filter === filterKey) {
      t.className = 'filter-tab active flex-1 py-1.5 rounded-lg bg-sky-500 text-white font-semibold text-center transition';
    } else {
      t.className = 'filter-tab flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white text-center transition';
    }
  });
  renderMyChannelsScreen();
}

// =============================================================================
// API CALLS (CHANNELS & VOICES)
// =============================================================================
async function fetchChannels() {
  if (!state.user) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/channels?user_id=${state.user.id}`);
    if (!res.ok) throw new Error('Không thể tải danh sách kênh');
    const data = await res.json();
    state.channels = data.channels || [];
    renderChannelsList();

    const countBadge = document.getElementById('myChannelsBadge');
    if (countBadge) countBadge.textContent = `${state.channels.length} Kênh`;

    const statChannels = document.getElementById('statChannelsCount');
    if (statChannels) statChannels.textContent = state.channels.length;

    if (!state.activeChannel && state.channels.length > 0) {
      loadChannelForPlayback(state.channels[0], false);
    }
  } catch (err) {
    console.error('fetchChannels error:', err);
    showToast('Lỗi kết nối tới máy chủ Radio VN', 'error');
  }
}

async function fetchVoices() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/voices`);
    if (res.ok) {
      const data = await res.json();
      state.voicesCatalog = data.voices || [];
      renderVoiceSelection();
    }
  } catch (e) {
    console.warn('Cannot fetch voices:', e);
  }
}

async function loadChannelForPlayback(channel, autoPlay = true) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/channels/${channel.id}`);
    if (!res.ok) throw new Error('Lỗi tải chi tiết kênh');
    const data = await res.json();

    state.activeChannel = data.channel;
    state.activeBroadcast = data.latest_broadcast;
    state.currentTime = 0;
    state.duration = data.latest_broadcast ? data.latest_broadcast.duration_est : 180;
    try { localStorage.setItem('radiovn_last_played_id', channel.id); } catch (e) {}

    updatePlayerUI();

    if (autoPlay) {
      startPlayback();
    } else {
      pausePlayback();
    }

    renderChannelsList();
  } catch (err) {
    console.error('loadChannelForPlayback error:', err);
    showToast('Không thể tải số phát thanh của kênh này', 'error');
  }
}

async function refreshChannelBroadcast(channelId) {
  showToast('Đang cập nhật tin mới & biên tập radio...', 'info');
  try {
    const res = await fetch(`${API_BASE_URL}/api/channels/${channelId}/generate-broadcast`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Lỗi làm mới kênh');
    const data = await res.json();
    showToast('Bản tin phát thanh 24/7 đã được cập nhật!', 'success');

    if (state.activeChannel && state.activeChannel.id === channelId) {
      state.activeBroadcast = data.broadcast;
      state.currentTime = 0;
      state.duration = data.broadcast.duration_est;
      updatePlayerUI();
      startPlayback();
    }

    fetchChannels();
  } catch (err) {
    console.error('refreshChannelBroadcast error:', err);
    showToast('Không thể cập nhật bản tin lúc này', 'error');
  }
}

async function deleteChannel(channelId) {
  if (!confirm('Bạn có chắc chắn muốn xóa kênh phát thanh này không?')) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/channels/${channelId}?user_id=${state.user.id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Không thể xóa kênh');

    showToast('Đã xóa kênh thành công', 'success');
    if (state.activeChannel && state.activeChannel.id === channelId) {
      audioEngine.stop();
      state.isPlaying = false;
      state.activeChannel = null;
      state.activeBroadcast = null;
      updatePlayerUI();
    }
    fetchChannels();
  } catch (err) {
    console.error('deleteChannel error:', err);
    showToast('Lỗi khi xóa kênh phát thanh', 'error');
  }
}

// =============================================================================
// AUDIO CONTROLS & TIMERS
// =============================================================================
function startPlayback() {
  if (!state.activeChannel || !state.activeBroadcast) {
    showToast('Vui lòng chọn 1 kênh phát thanh để nghe', 'warning');
    return;
  }

  state.isPlaying = true;
  audioEngine.playRadioJingle();

  setTimeout(() => {
    audioEngine.speakText(state.activeBroadcast.script_text, () => {
      if (state.activeChannel.broadcast_mode === 'live') {
        state.currentTime = 0;
        startPlayback();
      } else {
        pausePlayback();
      }
    });
  }, 500);

  if (audioEngine.timerInterval) clearInterval(audioEngine.timerInterval);
  audioEngine.timerInterval = setInterval(() => {
    if (state.isPlaying) {
      state.currentTime += 1;
      if (state.currentTime >= state.duration) {
        state.currentTime = state.duration;
      }
      updatePlayerTimeline();
    }
  }, 1000);

  updatePlayerUI();
  renderChannelsList();
}

function pausePlayback() {
  state.isPlaying = false;
  audioEngine.pause();
  if (audioEngine.timerInterval) {
    clearInterval(audioEngine.timerInterval);
  }
  updatePlayerUI();
  renderChannelsList();
}

function togglePlayPause() {
  if (state.isPlaying) {
    pausePlayback();
  } else {
    if (window.speechSynthesis && window.speechSynthesis.paused) {
      state.isPlaying = true;
      audioEngine.resume();
      audioEngine.timerInterval = setInterval(() => {
        if (state.isPlaying) {
          state.currentTime += 1;
          updatePlayerTimeline();
        }
      }, 1000);
      updatePlayerUI();
      renderChannelsList();
    } else {
      startPlayback();
    }
  }
}

function seekRelative(seconds) {
  state.currentTime = Math.max(0, Math.min(state.duration, state.currentTime + seconds));
  updatePlayerTimeline();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updatePlayerTimeline() {
  const fullCurr = document.getElementById('fullPlayerCurrentTime');
  const fullDur = document.getElementById('fullPlayerDuration');
  const fullProgress = document.getElementById('fullPlayerProgressBar');
  const miniProgressLine = document.getElementById('miniProgressLine');

  const percent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  if (fullCurr) fullCurr.textContent = formatTime(state.currentTime);
  if (fullDur) fullDur.textContent = formatTime(state.duration);
  if (fullProgress) fullProgress.value = percent;
  if (miniProgressLine) miniProgressLine.style.width = `${percent}%`;

  const homeProg = document.getElementById('homeContinueProgressBar');
  const homeTime = document.getElementById('homeContinueTimeText');
  if (homeProg) homeProg.style.width = `${percent}%`;
  if (homeTime) homeTime.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
}

function updatePlayerUI() {
  const miniTitle = document.getElementById('miniChannelTitle');
  const miniHeadline = document.getElementById('miniHeadline');
  const miniPlayIcon = document.getElementById('miniPlayIcon');
  const islandTrackName = document.getElementById('islandTrackName');

  const fullTitle = document.getElementById('fullPlayerTitle');
  const fullHeadline = document.getElementById('fullPlayerHeadline');
  const fullTopic = document.getElementById('fullPlayerTopic');
  const fullTone = document.getElementById('fullPlayerTone');
  const fullVoice = document.getElementById('fullPlayerVoice');
  const fullPlayIcon = document.getElementById('fullPlayIcon');

  const topicNames = {
    'cong-nghe': 'Công Nghệ',
    'giao-thong': 'Giao Thông',
    'kinh-doanh': 'Tài Chính',
    'the-thao': 'Thể Thao',
    'tong-hop': 'Tổng Hợp'
  };

  if (!state.activeChannel) {
    if (miniTitle) miniTitle.textContent = 'Chưa chọn kênh';
    if (miniHeadline) miniHeadline.textContent = 'Bấm chọn 1 kênh bên dưới để nghe';
    if (islandTrackName) islandTrackName.textContent = 'Radio VN';
    return;
  }

  const channelTitle = state.activeChannel.name;
  let headlineSnippet = state.activeChannel.prompt;
  if (state.activeBroadcast && state.activeBroadcast.headlines && state.activeBroadcast.headlines.length > 0) {
    headlineSnippet = state.activeBroadcast.headlines[0].title;
  }

  if (miniTitle) miniTitle.textContent = channelTitle;
  if (miniHeadline) miniHeadline.textContent = headlineSnippet;
  if (islandTrackName) islandTrackName.textContent = channelTitle.split(' ')[0] || 'Radio VN';

  if (fullTitle) fullTitle.textContent = channelTitle;
  if (fullHeadline) fullHeadline.textContent = headlineSnippet;
  if (fullTopic) fullTopic.textContent = topicNames[state.activeChannel.topic] || 'Tin Tức';
  if (fullTone) fullTone.textContent = state.activeChannel.tone;
  if (fullVoice) fullVoice.innerHTML = `<i data-lucide="mic" class="w-3.5 h-3.5"></i><span>${state.activeChannel.voice_name}</span>`;

  [miniPlayIcon, fullPlayIcon].forEach(icon => {
    if (icon) {
      if (state.isPlaying) {
        icon.setAttribute('data-lucide', 'pause');
        icon.classList.remove('ml-0.5', 'ml-1');
      } else {
        icon.setAttribute('data-lucide', 'play');
        icon.classList.add('ml-0.5');
      }
    }
  });

  if (window.lucide) window.lucide.createIcons();
  updatePlayerTimeline();
}

function openFullscreenPlayer() {
  const fullPlayer = document.getElementById('fullScreenPlayer');
  if (fullPlayer) fullPlayer.classList.add('player-open');
}

function closeFullscreenPlayer() {
  const fullPlayer = document.getElementById('fullScreenPlayer');
  if (fullPlayer) fullPlayer.classList.remove('player-open');
}

// =============================================================================
// RENDERING HOME SCREEN (TRANG CHỦ - NỔI BẬT & CÁ NHÂN HÓA)
// =============================================================================
function renderHomeScreen() {
  const featuredContainer = document.getElementById('homeFeaturedLive');
  const continueContainer = document.getElementById('homeContinueListening');
  const quickTagsContainer = document.getElementById('homeQuickTagsContainer');

  if (!featuredContainer || !continueContainer) return;

  const topicBadges = {
    'cong-nghe': { bg: 'bg-sky-500/10 text-sky-400 border-sky-500/30', label: 'Công Nghệ' },
    'giao-thong': { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Giao Thông' },
    'kinh-doanh': { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Tài Chính' },
    'the-thao': { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30', label: 'Thể Thao' },
    'tong-hop': { bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30', label: 'Tổng Hợp' }
  };

  const quickPresets = {
    'all': { label: 'Tất cả' },
    'morning': { label: 'Buổi sáng', topic: 'tong-hop', prompt: 'Điểm tin sáng sớm, thời tiết hôm nay và câu chuyện truyền cảm hứng khởi đầu ngày mới.' },
    'traffic': { label: 'Lái xe', topic: 'giao-thong', prompt: 'Bản tin giao thông giờ cao điểm, tình trạng các tuyến đường và tin tức tài xế cần biết.' },
    'news': { label: 'Tin nhanh', topic: 'tong-hop', prompt: 'Điểm tin nhanh thời sự 24/7, sự kiện quan trọng và tin vắn trong nước, quốc tế.' },
    'finance': { label: 'Tài chính', topic: 'kinh-doanh', prompt: 'Điểm tin tài chính thị trường, biến động giá vàng, chứng khoán và kinh tế mới nhất.' },
    'tech': { label: 'Công nghệ', topic: 'cong-nghe', prompt: 'Tin tức công nghệ mới nhất, trí tuệ nhân tạo AI và chuyển đổi số tiêu biểu.' },
    'sports': { label: 'Thể thao', topic: 'the-thao', prompt: 'Bản tin thể thao tổng hợp, kết quả các trận bóng đá và tin tức các giải đấu.' }
  };

  // 1. Setup Quick Tags active states & click handling
  if (quickTagsContainer) {
    quickTagsContainer.querySelectorAll('.home-quick-tag').forEach(btn => {
      const tag = btn.dataset.tag;
      if (tag === state.homeQuickTag) {
        btn.className = 'home-quick-tag active flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-500 text-white shadow-sm shadow-sky-500/30 border border-sky-400 transition';
      } else {
        btn.className = 'home-quick-tag flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 transition';
      }

      btn.onclick = (e) => {
        e.stopPropagation();
        state.homeQuickTag = tag;
        renderHomeScreen();
      };
    });
  }

  // 2. Filter 1-2 Featured Live Channels
  let livePool = state.channels;
  if (state.homeQuickTag && state.homeQuickTag !== 'all') {
    const preset = quickPresets[state.homeQuickTag];
    if (preset) {
      livePool = livePool.filter(c => {
        const topicMatch = preset.topic && c.topic === preset.topic;
        const textMatch = c.name.toLowerCase().includes(preset.label.toLowerCase()) ||
                          c.prompt.toLowerCase().includes(preset.label.toLowerCase());
        return topicMatch || textMatch;
      });
    }
  }

  // Ưu tiên kênh đang phát live
  let featuredChannels = livePool.filter(c => c.broadcast_mode === 'live');
  if (featuredChannels.length === 0) {
    featuredChannels = livePool.slice(0, 2);
  } else {
    featuredChannels = featuredChannels.slice(0, 2);
  }

  if (featuredChannels.length === 0) {
    const currentPreset = quickPresets[state.homeQuickTag] || quickPresets['all'];
    featuredContainer.innerHTML = `
      <div class="glass-card rounded-2xl p-4 text-center space-y-2.5 border border-dashed border-sky-500/30 bg-slate-900/40">
        <div class="w-10 h-10 rounded-full bg-sky-500/15 text-sky-400 flex items-center justify-center mx-auto shadow-inner">
          <i data-lucide="sparkles" class="w-5 h-5"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white">Chưa có kênh cho chủ đề "${currentPreset.label}"</h4>
          <p class="text-[10px] text-slate-400 mt-0.5 leading-relaxed">Tạo ngay một đài phát thanh AI cập nhật tin tức theo yêu cầu này chỉ với 1 chạm.</p>
        </div>
        <button id="btnCreateFromTag" class="px-3 py-1.5 rounded-xl gradient-accent text-[11px] font-bold text-white shadow-md active:scale-95 transition inline-flex items-center gap-1.5">
          <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
          <span>Tạo Kênh "${currentPreset.label}" Bằng Prompt</span>
        </button>
      </div>
    `;
    document.getElementById('btnCreateFromTag')?.addEventListener('click', () => {
      openWizardModal(currentPreset.prompt ? { prompt: currentPreset.prompt } : null);
    });
  } else {
    const primaryCh = featuredChannels[0];
    const isPrimaryActive = state.activeChannel && state.activeChannel.id === primaryCh.id;
    const isPrimaryPlaying = isPrimaryActive && state.isPlaying;
    const tBadge1 = topicBadges[primaryCh.topic] || topicBadges['cong-nghe'];

    let cardsHtml = `
      <!-- Kênh Tiêu Biểu #1 (Spotlight Card) -->
      <div class="featured-live-spotlight rounded-2xl p-3.5 space-y-2.5 overflow-hidden transition active:scale-[0.99] ${isPrimaryPlaying ? 'is-active-playing ring-1 ring-sky-500/50' : ''}">
        
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-red-500/20 text-red-400 border border-red-500/40 flex items-center gap-1 shadow-sm">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              TRỰC TIẾP
            </span>
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border ${tBadge1.bg}">
              ${tBadge1.label}
            </span>
            <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              ${primaryCh.tone}
            </span>
          </div>

          ${isPrimaryPlaying ? `
            <div class="flex items-end gap-0.5 h-4 px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
          ` : `
            <div class="text-[10px] text-slate-400 flex items-center gap-1">
              <i data-lucide="mic" class="w-3 h-3 text-sky-400"></i>
              <span class="truncate max-w-[85px]">${primaryCh.voice_name.split('(')[0]}</span>
            </div>
          `}
        </div>

        <div>
          <h4 class="text-sm font-extrabold text-white line-clamp-1">
            ${primaryCh.name}
          </h4>
          <p class="text-[10px] text-slate-300 line-clamp-2 mt-1 leading-relaxed bg-slate-900/50 p-2 rounded-xl border border-slate-800/80">
            ${primaryCh.prompt}
          </p>
        </div>

        <div class="pt-1.5 flex items-center gap-2">
          <button class="btn-home-refresh p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 border border-slate-700/60 active:scale-95 transition" title="Làm mới tin" data-id="${primaryCh.id}">
            <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-home-script p-2 text-slate-400 hover:text-sky-400 rounded-xl bg-slate-800/80 border border-slate-700/60 active:scale-95 transition" title="Xem kịch bản" data-id="${primaryCh.id}">
            <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-home-play flex-1 py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg active:scale-95 ${isPrimaryPlaying ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-sky-500/25 ring-2 ring-sky-400/30' : 'bg-gradient-to-r from-red-500 via-rose-500 to-amber-500 hover:from-red-600 hover:to-amber-600 text-white shadow-red-500/30'}" data-id="${primaryCh.id}">
            <i data-lucide="${isPrimaryPlaying ? 'pause' : 'play'}" class="w-3.5 h-3.5 fill-current"></i>
            <span>${isPrimaryPlaying ? 'Tạm Dừng' : 'Nghe Ngay'}</span>
          </button>
        </div>

      </div>
    `;

    // Kênh Tiêu Biểu #2 (Secondary Card nếu có)
    if (featuredChannels.length > 1) {
      const secondaryCh = featuredChannels[1];
      const isSecActive = state.activeChannel && state.activeChannel.id === secondaryCh.id;
      const isSecPlaying = isSecActive && state.isPlaying;
      const tBadge2 = topicBadges[secondaryCh.topic] || topicBadges['cong-nghe'];

      cardsHtml += `
        <div class="featured-live-secondary rounded-xl p-2.5 flex items-center justify-between gap-2.5 active:scale-[0.99] transition">
          <div class="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 text-red-400">
            <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          </div>

          <div class="flex-1 min-w-0">
            <h5 class="text-xs font-bold text-white truncate">${secondaryCh.name}</h5>
            <div class="text-[10px] text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
              <span class="text-sky-400">${tBadge2.label}</span>
              <span>•</span>
              <span class="truncate">${secondaryCh.voice_name.split('(')[0]}</span>
            </div>
          </div>

          <button class="btn-home-play px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 flex-shrink-0 ${isSecPlaying ? 'bg-sky-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}" data-id="${secondaryCh.id}">
            <i data-lucide="${isSecPlaying ? 'pause' : 'play'}" class="w-3 h-3"></i>
            <span>${isSecPlaying ? 'Dừng' : 'Nghe Ngay'}</span>
          </button>
        </div>
      `;
    }

    featuredContainer.innerHTML = cardsHtml;
  }

  // 3. Render Continue Listening Section (Nghe Tiếp Gần Đây)
  let recentChannel = null;
  if (state.activeChannel) {
    recentChannel = state.activeChannel;
  } else {
    const savedId = parseInt(localStorage.getItem('radiovn_last_played_id') || '0');
    if (savedId) {
      recentChannel = state.channels.find(c => c.id === savedId);
    }
    if (!recentChannel && state.channels.length > 0) {
      recentChannel = state.channels[0];
    }
  }

  if (recentChannel) {
    const isThisActive = state.activeChannel && state.activeChannel.id === recentChannel.id;
    const isThisPlaying = isThisActive && state.isPlaying;
    const tBadge = topicBadges[recentChannel.topic] || topicBadges['cong-nghe'];

    const currSec = isThisActive ? state.currentTime : 45;
    const durSec = (isThisActive && state.duration > 0) ? state.duration : (recentChannel.duration_est || 180);
    const percent = durSec > 0 ? Math.min(100, Math.round((currSec / durSec) * 100)) : 0;

    continueContainer.innerHTML = `
      <div class="continue-listening-card rounded-2xl p-3 flex items-center gap-3 cursor-pointer group" id="cardContinueListening" data-id="${recentChannel.id}">
        <!-- Vinyl Record / Channel Icon -->
        <div class="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500/20 via-orange-500/15 to-sky-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-400 relative overflow-hidden shadow-inner">
          <i data-lucide="radio" class="w-5 h-5 ${isThisPlaying ? 'text-sky-400 animate-pulse' : 'text-amber-400'}"></i>
          ${isThisPlaying ? `
            <div class="absolute inset-0 bg-sky-500/10 flex items-center justify-center">
              <span class="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
            </div>
          ` : ''}
        </div>

        <!-- Info & Progress Bar -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1 mb-0.5">
            <h4 class="text-xs font-bold text-white truncate group-hover:text-amber-300 transition">
              ${recentChannel.name}
            </h4>
            <span class="text-[9px] font-mono text-slate-400 flex-shrink-0" id="homeContinueTimeText">
              ${formatTime(currSec)} / ${formatTime(durSec)}
            </span>
          </div>

          <div class="text-[10px] text-slate-400 flex items-center gap-1.5 truncate mb-1.5">
            <span class="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[9px] font-medium">${tBadge.label}</span>
            <span>•</span>
            <span class="truncate">${recentChannel.voice_name.split('(')[0]}</span>
          </div>

          <!-- Progress Bar -->
          <div class="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div id="homeContinueProgressBar" class="h-full bg-gradient-to-r from-amber-400 to-sky-400 rounded-full transition-all duration-300" style="width: ${percent}%"></div>
          </div>
        </div>

        <!-- Direct Play/Resume Action Button -->
        <button class="btn-continue-play w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition active:scale-90 shadow-md ${isThisPlaying ? 'bg-amber-500 text-slate-950 shadow-amber-500/30' : 'bg-slate-800 hover:bg-slate-700 text-white'}" data-id="${recentChannel.id}" title="${isThisPlaying ? 'Tạm dừng' : 'Tiếp tục nghe'}">
          <i data-lucide="${isThisPlaying ? 'pause' : 'play'}" class="w-3.5 h-3.5 ${isThisPlaying ? '' : 'ml-0.5'}"></i>
        </button>
      </div>
    `;

    // Click handler on card to open or play
    const contCard = document.getElementById('cardContinueListening');
    if (contCard) {
      contCard.addEventListener('click', (e) => {
        if (e.target.closest('.btn-continue-play')) return;
        if (state.activeChannel && state.activeChannel.id === recentChannel.id) {
          openFullscreenPlayer();
        } else {
          loadChannelForPlayback(recentChannel, true);
        }
      });
    }

    const contPlayBtn = continueContainer.querySelector('.btn-continue-play');
    if (contPlayBtn) {
      contPlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.activeChannel && state.activeChannel.id === recentChannel.id) {
          togglePlayPause();
        } else {
          loadChannelForPlayback(recentChannel, true);
        }
      });
    }

  } else {
    continueContainer.innerHTML = `
      <div class="glass-card rounded-xl p-3 text-center text-slate-400 text-xs">
        Chưa có lịch sử phát thanh. Hãy chọn một kênh bên trên để bắt đầu nghe!
      </div>
    `;
  }

  // 4. Bind event listeners for Home Featured buttons
  featuredContainer.querySelectorAll('.btn-home-play').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const ch = state.channels.find(c => c.id === id);
      if (ch) {
        if (state.activeChannel && state.activeChannel.id === id) {
          togglePlayPause();
        } else {
          loadChannelForPlayback(ch, true);
        }
      }
    });
  });

  featuredContainer.querySelectorAll('.btn-home-refresh').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      refreshChannelBroadcast(id);
    });
  });

  featuredContainer.querySelectorAll('.btn-home-script').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      openScriptSheetForChannel(id);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

// =============================================================================
// RENDERING MY CHANNELS SCREEN (QUẢN LÝ TẤT CẢ KÊNH CỦA TÔI)
// =============================================================================
function renderMyChannelsScreen() {
  const myChannelsContainer = document.getElementById('myChannelsContainer');
  if (!myChannelsContainer) return;

  let filtered = state.channels;
  if (state.filter === 'live') {
    filtered = filtered.filter(c => c.broadcast_mode === 'live');
  } else if (state.filter === 'podcast') {
    filtered = filtered.filter(c => c.broadcast_mode === 'podcast');
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.prompt.toLowerCase().includes(q) ||
      c.topic.toLowerCase().includes(q)
    );
  }

  const topicBadges = {
    'cong-nghe': { bg: 'bg-sky-500/10 text-sky-400 border-sky-500/30', label: 'Công Nghệ' },
    'giao-thong': { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Giao Thông' },
    'kinh-doanh': { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Tài Chính' },
    'the-thao': { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30', label: 'Thể Thao' },
    'tong-hop': { bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30', label: 'Tổng Hợp' }
  };

  const buildChannelCardHTML = (ch) => {
    const isCurrentActive = state.activeChannel && state.activeChannel.id === ch.id;
    const isThisPlaying = isCurrentActive && state.isPlaying;
    const tBadge = topicBadges[ch.topic] || topicBadges['cong-nghe'];

    return `
      <div class="glass-card rounded-2xl p-3.5 space-y-2.5 relative overflow-hidden transition active:scale-[0.99] ${isCurrentActive ? 'border-sky-500/60 shadow-lg shadow-sky-500/15' : ''}">
        
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold border ${tBadge.bg}">
              ${tBadge.label}
            </span>
            <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              ${ch.tone}
            </span>
            ${ch.broadcast_mode === 'live' ? `
              <span class="text-[9px] font-bold text-red-400 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                24/7
              </span>
            ` : (ch.broadcast_mode === 'schedule' ? `
              <span class="text-[9px] font-bold text-amber-400">Khung giờ</span>
            ` : `
              <span class="text-[9px] font-bold text-purple-400">Podcast</span>
            `)}
          </div>

          ${isThisPlaying ? `
            <div class="flex items-end gap-0.5 h-4 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
          ` : ''}
        </div>

        <div>
          <h4 class="text-xs font-bold text-white line-clamp-1 group-hover:text-sky-300">
            ${ch.name}
          </h4>
          <p class="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
            ${ch.prompt}
          </p>
        </div>

        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <div class="text-[10px] text-slate-400 flex items-center gap-1">
            <i data-lucide="mic" class="w-3 h-3 text-sky-400"></i>
            <span class="truncate max-w-[90px]">${ch.voice_name.split('(')[0]}</span>
          </div>

          <div class="flex items-center gap-1">
            <button class="btn-refresh-channel p-1.5 text-slate-400 hover:text-white rounded-lg active:bg-slate-800" title="Làm mới tin" data-id="${ch.id}">
              <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-view-script p-1.5 text-slate-400 hover:text-sky-400 rounded-lg active:bg-slate-800" title="Xem kịch bản" data-id="${ch.id}">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-delete-channel p-1.5 text-slate-500 hover:text-red-400 rounded-lg active:bg-slate-800" title="Xóa kênh" data-id="${ch.id}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-play-channel px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 ${isThisPlaying ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'bg-slate-800 text-white'}" data-id="${ch.id}">
              <i data-lucide="${isThisPlaying ? 'pause' : 'play'}" class="w-3 h-3"></i>
              <span>${isThisPlaying ? 'Tạm Dừng' : 'Nghe Ngay'}</span>
            </button>
          </div>
        </div>

      </div>
    `;
  };

  const cardsHtml = filtered.length > 0
    ? filtered.map(buildChannelCardHTML).join('')
    : `<div class="p-4 text-center text-slate-400 text-xs">Không tìm thấy kênh phù hợp.</div>`;

  myChannelsContainer.innerHTML = cardsHtml;

  const countBadge = document.getElementById('myChannelsBadge');
  if (countBadge) countBadge.textContent = `${state.channels.length} Kênh`;

  myChannelsContainer.querySelectorAll('.btn-play-channel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const ch = state.channels.find(c => c.id === id);
      if (ch) {
        if (state.activeChannel && state.activeChannel.id === id) {
          togglePlayPause();
        } else {
          loadChannelForPlayback(ch, true);
        }
      }
    });
  });

  myChannelsContainer.querySelectorAll('.btn-refresh-channel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      refreshChannelBroadcast(id);
    });
  });

  myChannelsContainer.querySelectorAll('.btn-view-script').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      openScriptSheetForChannel(id);
    });
  });

  myChannelsContainer.querySelectorAll('.btn-delete-channel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteChannel(id);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

// =============================================================================
// RENDERING MOBILE CHANNELS LIST (DISPATCHER)
// =============================================================================
function renderChannelsList() {
  renderHomeScreen();
  renderMyChannelsScreen();
}

// =============================================================================
// LIVE SCRIPT BOTTOM SHEET
// =============================================================================
async function openScriptSheetForChannel(channelId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/channels/${channelId}`);
    if (!res.ok) throw new Error('Không thể tải kịch bản');
    const data = await res.json();

    const titleEl = document.getElementById('scriptSheetTitle');
    const subEl = document.getElementById('scriptSheetSubtitle');
    const contentEl = document.getElementById('scriptSheetContent');
    const sheet = document.getElementById('mobileScriptSheet');

    if (titleEl) titleEl.textContent = `Kịch Bản: ${data.channel.name}`;
    if (subEl) subEl.textContent = `MC: ${data.channel.voice_name} • Phong cách: ${data.channel.tone}`;

    const scriptText = data.latest_broadcast ? data.latest_broadcast.script_text : 'Chưa có kịch bản cho số phát sóng này.';
    const formatted = scriptText.replace(/(\[SFX:[^\]]+\])/g, '<span class="sfx-badge px-2 py-0.5 rounded font-bold inline-block my-1">$1</span>');
    if (contentEl) contentEl.innerHTML = formatted;

    sheet.classList.remove('hidden');
    setTimeout(() => sheet.classList.remove('opacity-0'), 10);
  } catch (e) {
    showToast('Lỗi khi mở kịch bản phát thanh', 'error');
  }
}

function closeScriptSheet() {
  const sheet = document.getElementById('mobileScriptSheet');
  if (!sheet) return;
  sheet.classList.add('opacity-0');
  setTimeout(() => sheet.classList.add('hidden'), 200);
}

// =============================================================================
// STEP-BY-STEP WIZARD CONTROLLER (4 BƯỚC CHẶT CHẼ)
// =============================================================================
function openWizardModal(preset = null) {
  state.wizard.currentStep = 1;
  state.wizard.isPromptValidated = false;

  if (preset) {
    state.wizard.prompt = preset.prompt || '';
    state.wizard.channelName = preset.prompt ? preset.prompt.slice(0, 32) + '...' : '';
  } else {
    state.wizard.prompt = '';
    state.wizard.channelName = '';
  }

  const nameInput = document.getElementById('wizChannelName');
  const promptInput = document.getElementById('wizPrompt');
  const valBox = document.getElementById('promptValidationBox');
  const wlBox = document.getElementById('whitelistResultBox');

  if (nameInput) nameInput.value = state.wizard.channelName;
  if (promptInput) promptInput.value = state.wizard.prompt;
  if (valBox) valBox.classList.add('hidden');
  if (wlBox) wlBox.classList.add('hidden');

  updateWizardStepView();

  const modal = document.getElementById('wizardModal');
  if (modal) modal.classList.remove('hidden');
}

function closeWizardModal() {
  const modal = document.getElementById('wizardModal');
  if (modal) modal.classList.add('hidden');
}

function updateWizardStepView() {
  const step = state.wizard.currentStep;
  const subtitles = {
    1: 'Bước 1: Nhập Prompt Tự Do & AI Duyệt',
    2: 'Bước 2: AI Đề Xuất & Duyệt Nguồn Báo',
    3: 'Bước 3: Chọn Giọng MC & Hình Thức Phát',
    4: 'Bước 4: AI Biên Tập & Lên Sóng Live'
  };

  const subHeader = document.getElementById('wizStepHeaderSubtitle');
  if (subHeader) subHeader.textContent = subtitles[step] || 'Khởi Tạo Kênh Radio AI';

  // Toggle step containers
  [1, 2, 3, 4].forEach(s => {
    const el = document.getElementById(`wizardStep${s}`);
    if (el) {
      if (s === step) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  // Step Indicator badges
  document.querySelectorAll('.step-nav-item').forEach(item => {
    const s = parseInt(item.dataset.step);
    const badge = item.querySelector('.step-badge');
    if (s < step) {
      badge.className = 'step-badge w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold';
      badge.innerHTML = '✓';
    } else if (s === step) {
      badge.className = 'step-badge w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center text-[10px] font-bold shadow-md shadow-sky-500/40';
      badge.textContent = s;
    } else {
      badge.className = 'step-badge w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px]';
      badge.textContent = s;
    }
  });

  for (let i = 1; i <= 3; i++) {
    const line = document.getElementById(`line-${i}`);
    if (line) {
      if (step > i) line.classList.add('active');
      else line.classList.remove('active');
    }
  }

  const btnPrev = document.getElementById('btnWizPrev');
  const btnNext = document.getElementById('btnWizNext');
  const btnFinish = document.getElementById('btnWizFinish');

  if (btnPrev) btnPrev.disabled = (step === 1);

  if (step === 4) {
    if (btnNext) btnNext.classList.add('hidden');
    if (btnFinish) btnFinish.classList.remove('hidden');
  } else {
    if (btnNext) btnNext.classList.remove('hidden');
    if (btnFinish) btnFinish.classList.add('hidden');
  }

  // Trigger step-specific logic
  if (step === 2) {
    loadSuggestedSourcesForStep2();
  } else if (step === 3) {
    renderVoiceSelection();
  } else if (step === 4) {
    triggerStep4EditorialPipeline();
  }

  if (window.lucide) window.lucide.createIcons();
}

// BƯỚC 1: AI KIỂM TRA & DUYỆT PROMPT
async function handleValidatePrompt() {
  const promptInput = document.getElementById('wizPrompt');
  const nameInput = document.getElementById('wizChannelName');
  const valBox = document.getElementById('promptValidationBox');
  const btnVal = document.getElementById('btnValidatePrompt');

  const promptText = promptInput ? promptInput.value.trim() : '';

  if (!promptText) {
    showToast('Vui lòng nhập mô tả Prompt cho kênh radio', 'warning');
    if (valBox) {
      valBox.className = 'p-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs';
      valBox.textContent = 'Vui lòng nhập Prompt yêu cầu nội dung kênh phát thanh.';
      valBox.classList.remove('hidden');
    }
    return;
  }

  if (btnVal) {
    btnVal.disabled = true;
    btnVal.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>AI Đang Phân Tích & Duyệt Prompt...</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/validate-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText })
    });
    const data = await res.json();

    valBox.classList.remove('hidden');

    if (data.valid) {
      // ✅ Prompt HỢP LỆ
      state.wizard.isPromptValidated = true;
      state.wizard.prompt = promptText;
      state.wizard.topic = data.inferred_topic;
      state.wizard.topicLabel = data.topic_label;
      state.wizard.tone = data.inferred_tone;

      // Tự điền tên kênh gợi ý nếu người dùng chưa nhập
      if (nameInput && !nameInput.value.trim()) {
        nameInput.value = data.suggested_title;
        state.wizard.channelName = data.suggested_title;
      } else if (nameInput) {
        state.wizard.channelName = nameInput.value.trim();
      }

      valBox.className = 'p-3.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-xs space-y-2';
      valBox.innerHTML = `
        <div class="flex items-center gap-2 font-bold text-emerald-400">
          <i data-lucide="check-circle-2" class="w-4 h-4"></i>
          <span>${data.message}</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 pt-1">
          <span class="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
            Chủ đề: ${data.topic_label}
          </span>
          <span class="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
            Phong cách: ${data.inferred_tone}
          </span>
        </div>
        <p class="text-[11px] text-slate-300">${data.summary}</p>
        <div class="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
          <span>➔ Đã sẵn sàng! Bạn hãy bấm "Tiếp tục" bên dưới để chọn nguồn báo.</span>
        </div>
      `;

      showToast('Prompt hợp lệ! Bạn có thể sang Bước 2.', 'success');

    } else {
      // ❌ Prompt QUÁ NGẮN / CHƯA HỢP LỆ
      state.wizard.isPromptValidated = false;
      valBox.className = 'p-3.5 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs space-y-1.5';
      valBox.innerHTML = `
        <div class="flex items-center gap-2 font-bold text-rose-400">
          <i data-lucide="alert-triangle" class="w-4 h-4"></i>
          <span>Prompt Chưa Đủ Thông Tin</span>
        </div>
        <p class="text-[11px] text-slate-300 leading-relaxed">${data.message}</p>
      `;
    }

    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error('validatePrompt error:', err);
    if (valBox) {
      valBox.className = 'p-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs';
      valBox.textContent = 'Không thể kết nối dịch vụ kiểm tra Prompt. Vui lòng thử lại.';
      valBox.classList.remove('hidden');
    }
  } finally {
    if (btnVal) {
      btnVal.disabled = false;
      btnVal.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4"></i><span>Gửi Prompt Để AI Kiểm Tra & Duyệt</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// BƯỚC 2: TẢI DANH SÁCH NGUỒN BÁO GỢI Ý & WHITELIST
async function loadSuggestedSourcesForStep2() {
  const container = document.getElementById('wizSourcesList');
  if (!container) return;

  container.innerHTML = '<div class="text-[11px] text-slate-400 py-4 text-center">Đang lọc danh sách báo chí chính thống...</div>';

  try {
    const encodedPrompt = encodeURIComponent(state.wizard.prompt || '');
    const res = await fetch(`${API_BASE_URL}/api/sources/suggest?topic=${state.wizard.topic}&prompt=${encodedPrompt}`);
    if (!res.ok) throw new Error('Không lấy được nguồn');
    const data = await res.json();
    const sources = data.sources || [];

    state.wizard.sources = sources.filter(s => s.active).map(s => s.name);

    container.innerHTML = sources.map(s => {
      const isChecked = state.wizard.sources.includes(s.name);
      return `
        <label class="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 cursor-pointer active:scale-99 transition">
          <div class="flex items-center gap-2.5">
            <input type="checkbox" class="source-checkbox w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-600 focus:ring-0"
                   value="${s.name}" ${isChecked ? 'checked' : ''} />
            <div>
              <div class="text-xs font-bold text-white">${s.name}</div>
              <div class="text-[9px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span class="text-emerald-400 font-semibold">✓ ${s.whitelist_info ? s.whitelist_info.badge_text : 'Chính thống'}</span>
                <span>• ${s.domain}</span>
              </div>
            </div>
          </div>
          <span class="text-[9px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700 font-semibold">Đã duyệt</span>
        </label>
      `;
    }).join('');

    container.querySelectorAll('.source-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const val = cb.value;
        if (cb.checked) {
          if (!state.wizard.sources.includes(val)) state.wizard.sources.push(val);
        } else {
          state.wizard.sources = state.wizard.sources.filter(x => x !== val);
        }
      });
    });

  } catch (err) {
    console.error('loadSuggestedSourcesForStep2 error:', err);
    container.innerHTML = '<div class="text-[11px] text-rose-400 py-2">Không thể tải nguồn tin lúc này.</div>';
  }
}

// BƯỚC 2: KIỂM TRA WHITELIST URL MỚI
async function checkCustomUrlWhitelist() {
  const input = document.getElementById('wizCustomUrl');
  const box = document.getElementById('whitelistResultBox');
  if (!input || !box) return;

  const url = input.value.trim();
  if (!url) {
    showToast('Vui lòng nhập URL hoặc tên miền báo chí', 'warning');
    return;
  }

  box.classList.remove('hidden');
  box.innerHTML = '<div class="text-[11px] text-slate-400">Đang đối soát Whitelist báo chí Việt Nam...</div>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/sources/check-domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (data.is_whitelisted) {
      box.className = 'p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-xs space-y-1.5';
      box.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-emerald-400">✓ ${data.badge_text}</span>
          <span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">${data.domain}</span>
        </div>
        <p class="text-[10px] text-slate-300 leading-tight">${data.message}</p>
        <button type="button" id="btnAddVerifiedSource" class="mt-1 px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1 active:scale-95 transition">
          <i data-lucide="plus" class="w-3 h-3"></i>
          <span>Thêm ${data.source_name} vào nguồn của kênh</span>
        </button>
      `;

      setTimeout(() => {
        document.getElementById('btnAddVerifiedSource')?.addEventListener('click', () => {
          if (!state.wizard.sources.includes(data.source_name)) {
            state.wizard.sources.push(data.source_name);
            showToast(`Đã thêm ${data.source_name} vào kênh!`, 'success');
            loadSuggestedSourcesForStep2();
          } else {
            showToast('Nguồn này đã có trong danh sách', 'info');
          }
        });
      }, 50);

    } else {
      box.className = 'p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs space-y-1';
      box.innerHTML = `
        <div class="font-bold text-amber-400">⚠️ ${data.badge_text} (${data.domain || 'Ngoại lai'})</div>
        <p class="text-[10px] text-slate-300 leading-tight">${data.message}</p>
      `;
    }

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    box.className = 'p-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-[11px]';
    box.textContent = 'Lỗi kết nối kiểm tra tên miền.';
  }
}

// BƯỚC 3: HIỂN THỊ CHỌN MC & NGHE THỬ MẪU GIỌNG
function renderVoiceSelection() {
  const container = document.getElementById('wizVoicesGrid');
  if (!container) return;

  const voices = state.voicesCatalog.length > 0 ? state.voicesCatalog : [
    { code: 'vi-VN-MinhQuan', name: 'MC Minh Quân', gender: 'Nam', region: 'Giọng Bắc (Hà Nội)', tone_specialty: 'Sôi nổi, Công nghệ', sample_text: 'Xin chào quý thính giả đang nghe Radio VN. Tôi là Minh Quân.' },
    { code: 'vi-VN-ThuHa', name: 'MC Thu Hà', gender: 'Nữ', region: 'Giọng Bắc (Hà Nội)', tone_specialty: 'Trang trọng, Tài chính', sample_text: 'Kính chào quý vị thính giả. Đây là bản tin tài chính.' },
    { code: 'vi-VN-TanPhat', name: 'MC Tấn Phát', gender: 'Nam', region: 'Giọng Nam (Sài Gòn)', tone_specialty: 'Vui vẻ, Thân thiện, Bác tài', sample_text: 'A lô a lô! Tấn Phát thân chào toàn thể anh em bác tài!' },
    { code: 'vi-VN-MaiPhuong', name: 'MC Mai Phương', gender: 'Nữ', region: 'Giọng Nam (Sài Gòn)', tone_specialty: 'Ngọt ngào, Nhẹ nhàng', sample_text: 'Mai Phương mến chào quý thính giả Radio VN.' }
  ];

  container.innerHTML = voices.map(v => {
    const isSelected = (state.wizard.voiceCode === v.code);
    return `
      <div class="voice-card border ${isSelected ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-900/80'} rounded-2xl p-3 cursor-pointer active:scale-99 transition relative"
           data-code="${v.code}" data-name="${v.name} (${v.gender} - ${v.region})">
        
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-xl ${v.gender === 'Nam' ? 'bg-sky-500/20 text-sky-400' : 'bg-pink-500/20 text-pink-400'} flex items-center justify-center font-bold text-xs">
              <i data-lucide="mic" class="w-4 h-4"></i>
            </div>
            <div>
              <h4 class="text-xs font-bold text-white">${v.name}</h4>
              <p class="text-[9px] text-slate-400">${v.region}</p>
            </div>
          </div>
          <span class="text-[9px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
            ${v.tone_specialty}
          </span>
        </div>

        <button type="button" class="btn-preview-voice w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 text-[10px] font-bold flex items-center justify-center gap-1 transition active:scale-95"
                data-text="${v.sample_text}">
          <i data-lucide="volume-2" class="w-3.5 h-3.5"></i>
          <span>Nghe thử mẫu giọng</span>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  container.querySelectorAll('.voice-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-preview-voice')) return;
      state.wizard.voiceCode = card.dataset.code;
      state.wizard.voiceName = card.dataset.name;
      renderVoiceSelection();
    });
  });

  container.querySelectorAll('.btn-preview-voice').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.text;
      audioEngine.playRadioJingle();
      setTimeout(() => audioEngine.speakText(text), 450);
    });
  });
}

// BƯỚC 4: AI BIÊN TẬP KỊCH BẢN RADIO
async function triggerStep4EditorialPipeline() {
  const progressText = document.getElementById('pipelineProgressText');
  const previewBox = document.getElementById('wizScriptPreviewBox');
  const durEl = document.getElementById('wizEstimatedDuration');

  if (progressText) progressText.textContent = 'Đang chạy Pipeline AI Editorial...';
  if (previewBox) previewBox.innerHTML = '<span class="text-sky-400 animate-pulse">Đang kết nối RSS báo chí & sinh kịch bản MC...</span>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/editorial-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.wizard.channelName || 'Kênh Tin Tức Mới',
        prompt: state.wizard.prompt,
        topic: state.wizard.topic,
        tone: state.wizard.tone,
        voice_code: state.wizard.voiceCode,
        content_type: state.wizard.contentType,
        sources: state.wizard.sources
      })
    });

    if (!res.ok) throw new Error('Biên tập thất bại');
    const data = await res.json();
    state.wizard.previewData = data.preview;

    if (progressText) progressText.textContent = '✓ Pipeline hoàn tất 100%';
    if (durEl) durEl.textContent = data.preview.duration_formatted;

    const script = data.preview.full_script;
    const formatted = script.replace(/(\[SFX:[^\]]+\])/g, '<span class="sfx-badge px-1.5 py-0.5 rounded font-bold inline-block my-1">$1</span>');
    if (previewBox) previewBox.innerHTML = formatted;

  } catch (err) {
    console.error('triggerStep4EditorialPipeline error:', err);
    if (progressText) progressText.textContent = 'Lỗi pipeline';
    if (previewBox) previewBox.textContent = 'Không thể biên tập kịch bản lúc này.';
  }
}

// LƯU KÊNH & BẮT ĐẦU NGHE (HOÀN THÀNH WIZARD)
async function submitCreateChannel() {
  const btn = document.getElementById('btnWizFinish');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Đang lên sóng trực tiếp...</span>';
  }

  try {
    const payload = {
      user_id: state.user ? state.user.id : 1,
      name: state.wizard.channelName || 'Kênh Tin Tức Cá Nhân Hóa',
      prompt: state.wizard.prompt || 'Tin tức tự động theo sở thích',
      topic: state.wizard.topic,
      tone: state.wizard.tone,
      content_type: state.wizard.contentType,
      sources: state.wizard.sources,
      broadcast_mode: state.wizard.broadcastMode,
      voice_code: state.wizard.voiceCode,
      voice_name: state.wizard.voiceName
    };

    const res = await fetch(`${API_BASE_URL}/api/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Không thể tạo kênh');
    const data = await res.json();

    // Đánh dấu hoàn tất Onboarding
    state.isOnboarded = true;
    localStorage.setItem('radiovn_onboarded', 'true');

    showToast(`Đã tạo kênh '${data.channel.name}' thành công! Bắt đầu phát sóng.`, 'success');
    closeWizardModal();

    // Tải lại kênh và chuyển về Dashboard
    switchTab('screenHome');
    await fetchChannels();
    loadChannelForPlayback(data.channel, true);
    openFullscreenPlayer();

  } catch (err) {
    console.error('submitCreateChannel error:', err);
    showToast('Lỗi khi lưu kênh phát thanh', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="radio" class="w-4 h-4"></i><span>Lưu Kênh & Bắt Đầu Nghe</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// =============================================================================
// DARK MODE CONTROLLER (CHẾ ĐỘ TỐI / SÁNG)
// =============================================================================
function initDarkMode() {
  const savedTheme = localStorage.getItem('radiovn_theme') || 'dark';
  applyTheme(savedTheme, false);
}

function applyTheme(theme, notify = false) {
  const isDark = theme === 'dark';
  const badge = document.getElementById('darkModeBadge');
  const switchContainer = document.getElementById('darkModeSwitch');
  const switchDot = document.getElementById('darkModeSwitchDot');
  const icon = document.getElementById('darkModeIcon');

  if (isDark) {
    document.body.classList.remove('light-mode');
    document.body.classList.add('dark-mode');
    if (badge) {
      badge.textContent = 'Bật';
      badge.className = 'text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30';
    }
    if (switchContainer) switchContainer.className = 'w-10 h-5 bg-sky-500 rounded-full relative transition-colors duration-200';
    if (switchDot) switchDot.className = 'w-4 h-4 bg-white rounded-full absolute top-0.5 right-0.5 transition-all duration-200 shadow-md';
    if (icon) icon.setAttribute('data-lucide', 'moon');
  } else {
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
    if (badge) {
      badge.textContent = 'Tắt';
      badge.className = 'text-[10px] px-2 py-0.5 rounded bg-slate-700/50 text-slate-400 font-bold border border-slate-700';
    }
    if (switchContainer) switchContainer.className = 'w-10 h-5 bg-slate-700 rounded-full relative transition-colors duration-200';
    if (switchDot) switchDot.className = 'w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 transition-all duration-200 shadow-md';
    if (icon) icon.setAttribute('data-lucide', 'sun');
  }

  if (window.lucide) window.lucide.createIcons();

  if (notify) {
    showToast(isDark ? 'Đã bật Chế độ tối (Dark Mode)' : 'Đã chuyển sang Chế độ ban ngày (Light Mode)', 'info');
  }
}

function toggleDarkMode() {
  const currentTheme = localStorage.getItem('radiovn_theme') || 'dark';
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('radiovn_theme', nextTheme);
  applyTheme(nextTheme, true);
}

// =============================================================================
// AI MC VOICES MODAL CONTROLLER
// =============================================================================
const DEFAULT_AI_VOICES = [
  {
    code: 'vi-VN-MinhQuan',
    name: 'MC Minh Quân',
    gender: 'Nam',
    region: 'Giọng Bắc (Hà Nội)',
    tone_specialty: 'Sôi nổi, Công nghệ, Tri thức',
    description: 'Giọng đọc truyền cảm, dứt khoát, âm vực ấm áp rất phù hợp với tin tức công nghệ và thời sự.',
    sample_text: 'Xin chào quý thính giả đang theo dõi bản tin số trên sóng Radio VN. Tôi là Minh Quân.'
  },
  {
    code: 'vi-VN-ThuHa',
    name: 'MC Thu Hà',
    gender: 'Nữ',
    region: 'Giọng Bắc (Hà Nội)',
    tone_specialty: 'Trang trọng, Tài chính, Điềm đạm',
    description: 'Chất giọng thanh lịch, phát âm tròn vành rõ chữ, chuẩn phong cách phát thanh viên truyền hình.',
    sample_text: 'Kính chào quý vị thính giả. Đây là bản tin tài chính tổng hợp từ đài phát thanh Radio VN.'
  },
  {
    code: 'vi-VN-TanPhat',
    name: 'MC Tấn Phát',
    gender: 'Nam',
    region: 'Giọng Nam (Sài Gòn)',
    tone_specialty: 'Vui vẻ, Thân thiện, Bác tài',
    description: 'Giọng miền Nam mộc mạc, gần gũi, hóm hỉnh như một người bạn đồng hành tin cậy trên cabin.',
    sample_text: 'A lô a lô! Tấn Phát thân chào toàn thể anh em bác tài đang lăn bánh trên mọi cung đường!'
  },
  {
    code: 'vi-VN-MaiPhuong',
    name: 'MC Mai Phương',
    gender: 'Nữ',
    region: 'Giọng Nam (Sài Gòn)',
    tone_specialty: 'Ngọt ngào, Nhẹ nhàng, Thư giãn',
    description: 'Âm sắc trong trẻo, êm dịu, nhịp đọc thư thái rất thích hợp cho podcast đêm muộn hoặc phong cách sống.',
    sample_text: 'Mai Phương mến chào quý thính giả. Mời bạn cùng lắng lại và thưởng thức những giai điệu tin tức hôm nay.'
  }
];

function openVoicesModal() {
  const sheet = document.getElementById('voicesBottomSheet');
  const container = document.getElementById('profileVoicesList');
  if (!sheet || !container) return;

  const voices = (state.voicesCatalog && state.voicesCatalog.length > 0) ? state.voicesCatalog : DEFAULT_AI_VOICES;
  const currentVoiceCode = localStorage.getItem('radiovn_default_voice') || state.wizard.voiceCode || 'vi-VN-MinhQuan';

  container.innerHTML = voices.map(v => {
    const isSelected = v.code === currentVoiceCode;
    const isNorth = v.region.includes('Bắc');

    return `
      <div class="glass-card rounded-2xl p-3.5 space-y-2 border ${isSelected ? 'border-sky-500/60 bg-sky-950/20 shadow-md shadow-sky-500/10' : 'border-slate-800 hover:border-slate-700'} transition">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl ${isNorth ? 'bg-sky-500/20 text-sky-400' : 'bg-emerald-500/20 text-emerald-400'} flex items-center justify-center font-bold text-xs flex-shrink-0">
              ${v.gender === 'Nam' ? '👨' : '👩'}
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <h4 class="text-xs font-bold text-white">${v.name}</h4>
                <span class="text-[9px] px-1.5 py-0.2 rounded font-semibold ${isNorth ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}">
                  ${v.region}
                </span>
              </div>
              <p class="text-[10px] text-slate-400 mt-0.5 line-clamp-1">${v.tone_specialty}</p>
            </div>
          </div>

          ${isSelected ? `
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-sky-500 text-white font-bold flex items-center gap-1 shadow-sm flex-shrink-0">
              <i data-lucide="check" class="w-3 h-3"></i> Đang chọn
            </span>
          ` : ''}
        </div>

        <p class="text-[10px] text-slate-300 leading-relaxed bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
          ${v.description}
        </p>

        <div class="flex items-center gap-2 pt-0.5">
          <button class="btn-sample-voice flex-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition" data-text="${v.sample_text}" data-name="${v.name}">
            <i data-lucide="volume-2" class="w-3.5 h-3.5 text-sky-400"></i>
            <span>Nghe Thử Giọng</span>
          </button>
          <button class="btn-select-voice flex-1 py-1.5 px-2.5 rounded-xl ${isSelected ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'gradient-accent text-white shadow-md shadow-sky-500/20'} text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition" data-code="${v.code}" data-name="${v.name}">
            <i data-lucide="check-circle" class="w-3.5 h-3.5"></i>
            <span>${isSelected ? 'Đang Dùng' : 'Chọn Làm Mặc Định'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Bind preview voice audio
  container.querySelectorAll('.btn-sample-voice').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.text;
      const name = btn.dataset.name;
      audioEngine.playRadioJingle();
      setTimeout(() => audioEngine.speakText(text), 450);
      showToast(`Đang phát giọng đọc mẫu: ${name}`, 'info');
    });
  });

  // Bind select voice
  container.querySelectorAll('.btn-select-voice').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = btn.dataset.code;
      const name = btn.dataset.name;
      localStorage.setItem('radiovn_default_voice', code);
      state.wizard.voiceCode = code;
      state.wizard.voiceName = name;
      showToast(`Đã chọn ${name} làm giọng đọc ưu tiên!`, 'success');
      openVoicesModal(); // re-render to update selected tag
    });
  });

  sheet.classList.remove('hidden');
  setTimeout(() => sheet.classList.remove('opacity-0'), 10);
  if (window.lucide) window.lucide.createIcons();
}

function closeVoicesModal() {
  const sheet = document.getElementById('voicesBottomSheet');
  if (!sheet) return;
  sheet.classList.add('opacity-0');
  setTimeout(() => sheet.classList.add('hidden'), 200);
}

// =============================================================================
// WHITELIST SOURCES MODAL CONTROLLER
// =============================================================================
const OFFICIAL_WHITELIST_SOURCES = [
  { domain: 'vnexpress.net', name: 'VnExpress', type: 'Báo điện tử', tier: 'Cấp 1', desc: 'Báo tiếng Việt nhiều người đọc nhất, cập nhật liên tục 24/7' },
  { domain: 'tuoitre.vn', name: 'Báo Tuổi Trẻ', type: 'Báo điện tử', tier: 'Cấp 1', desc: 'Cơ quan ngôn luận uy tín, tin tức xã hội và đời sống đô thị' },
  { domain: 'thanhnien.vn', name: 'Báo Thanh Niên', type: 'Báo điện tử', tier: 'Cấp 1', desc: 'Điểm tin thời sự, pháp luật, giao thông và phóng sự chuyên sâu' },
  { domain: 'vietnamnet.vn', name: 'Báo VietNamNet', type: 'Báo điện tử', tier: 'Cấp 1', desc: 'Thời sự chính trị, kinh tế, công nghệ và chuyển đổi số quốc gia' },
  { domain: 'dantri.com.vn', name: 'Báo Dân Trí', type: 'Báo điện tử', tier: 'Cấp 1', desc: 'Tin tức nhân văn, an sinh xã hội, giáo dục và thế giới' },
  { domain: 'vov.vn', name: 'Đài Tiếng Nói Việt Nam (VOV)', type: 'Đài phát thanh', tier: 'Quốc Gia', desc: 'Cơ quan phát thanh quốc gia, kênh thời sự & giao thông số 1' },
  { domain: 'vtv.vn', name: 'Đài Truyền Hình Việt Nam (VTV)', type: 'Đài truyền hình', tier: 'Quốc Gia', desc: 'Kênh truyền hình quốc gia, thông tin chính luận và tiêu điểm' },
  { domain: 'baochinhphu.vn', name: 'Cổng Thông tin Chính phủ', type: 'Cơ quan Nhà nước', tier: 'Nhà Nước', desc: 'Văn bản chỉ đạo, điều hành kinh tế - xã hội chính thức' },
  { domain: 'laodong.vn', name: 'Báo Lao Động', type: 'Báo điện tử', tier: 'Cấp 1', desc: 'Bảo vệ quyền lợi người lao động, tin tức công đoàn & xã hội' },
  { domain: 'cafef.vn', name: 'CafeF', type: 'Trang tin Tài chính', tier: 'Chuyên Ngành', desc: 'Dữ liệu thị trường chứng khoán, bất động sản & doanh nghiệp' },
  { domain: 'genk.vn', name: 'GenK', type: 'Trang tin Công nghệ', tier: 'Chuyên Ngành', desc: 'Tin tức công nghệ mới, trí tuệ nhân tạo AI và đột phá số' },
  { domain: 'tinhte.vn', name: 'Tinh Tế', type: 'Diễn đàn Công nghệ', tier: 'Cộng Đồng', desc: 'Đánh giá thiết bị, xe cộ, đồ chơi số và trải nghiệm công nghệ' }
];

function openWhitelistModal() {
  const sheet = document.getElementById('whitelistBottomSheet');
  const container = document.getElementById('profileWhitelistList');
  if (!sheet || !container) return;

  container.innerHTML = OFFICIAL_WHITELIST_SOURCES.map(s => {
    let tierColor = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (s.tier === 'Quốc Gia' || s.tier === 'Nhà Nước') tierColor = 'bg-red-500/15 text-red-400 border-red-500/30';
    else if (s.tier === 'Chuyên Ngành') tierColor = 'bg-sky-500/15 text-sky-400 border-sky-500/30';

    return `
      <div class="glass-card rounded-xl p-3 flex items-start gap-3 border border-slate-800 hover:border-slate-700 transition">
        <div class="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
          <i data-lucide="shield-check" class="w-4 h-4"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <h4 class="text-xs font-bold text-white truncate">${s.name}</h4>
            <span class="text-[9px] px-1.5 py-0.2 rounded border font-semibold ${tierColor}">
              ${s.tier}
            </span>
          </div>
          <div class="text-[10px] text-sky-400 font-mono mt-0.5">${s.domain}</div>
          <p class="text-[10px] text-slate-400 mt-1 leading-snug">${s.desc}</p>
        </div>
        <span class="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5 flex-shrink-0 mt-0.5">
          <i data-lucide="check" class="w-3 h-3"></i> Hợp lệ
        </span>
      </div>
    `;
  }).join('');

  sheet.classList.remove('hidden');
  setTimeout(() => sheet.classList.remove('opacity-0'), 10);
  if (window.lucide) window.lucide.createIcons();
}

function closeWhitelistModal() {
  const sheet = document.getElementById('whitelistBottomSheet');
  if (!sheet) return;
  sheet.classList.add('opacity-0');
  setTimeout(() => sheet.classList.add('hidden'), 200);
}

// =============================================================================
// DOM EVENT LISTENERS INITIALIZATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 0. Khởi tạo Chế độ giao diện (Dark Mode / Light Mode)
  initDarkMode();

  // 1. Đồng hồ thời gian thực & Visualizer
  updateMobileClock();
  initCanvasVisualizer();

  // 2. Kiểm tra Authentication Gate
  checkAuthState(true);

  // 3. Nạp danh bạ giọng đọc AI
  fetchVoices();

  // Auth Gate Event Listeners
  document.getElementById('gateTabLogin')?.addEventListener('click', () => setGateAuthMode('login'));
  document.getElementById('gateTabRegister')?.addEventListener('click', () => setGateAuthMode('register'));
  document.getElementById('btnGateSubmit')?.addEventListener('click', handleGateAuthSubmit);
  document.getElementById('btnGateQuickDemo')?.addEventListener('click', handleQuickDemoLogin);

  // Top Bar User Avatar Dropdown
  document.getElementById('btnUserMenu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUserDropdown();
  });

  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('userMenuWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      closeUserDropdown();
    }
  });

  // Top Bar Dropdown Actions
  document.getElementById('menuBtnMyChannels')?.addEventListener('click', () => {
    closeUserDropdown();
    switchTab('screenMyChannels');
  });

  document.getElementById('menuBtnSettings')?.addEventListener('click', () => {
    closeUserDropdown();
    switchTab('screenProfile');
  });

  document.getElementById('menuBtnLogout')?.addEventListener('click', () => {
    handleLogout();
  });

  // Bottom Navigation Bar tabs switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) switchTab(target);
    });
  });

  // Center (+) Navigation Button & Hero button -> Open Wizard
  document.getElementById('btnNavCreate')?.addEventListener('click', () => openWizardModal());
  document.getElementById('btnHeroCreate')?.addEventListener('click', () => openWizardModal());
  document.getElementById('btnCreateMoreChannels')?.addEventListener('click', () => openWizardModal());
  // Click "Xem tất cả" tại Đang phát sóng -> chuyển sang Kênh của tôi và lọc ngay Live 24/7
  document.getElementById('btnViewAllChannels')?.addEventListener('click', () => {
    const searchInput = document.getElementById('mobileSearchInput');
    if (searchInput) {
      searchInput.value = '';
      state.searchQuery = '';
    }
    switchTab('screenMyChannels', { filter: 'live' });
  });

  // Mini Player Click -> Expand Fullscreen Player
  document.getElementById('miniPlayerClickArea')?.addEventListener('click', openFullscreenPlayer);
  document.getElementById('btnMiniExpand')?.addEventListener('click', openFullscreenPlayer);
  document.getElementById('btnMiniPlayPause')?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlayPause();
  });

  // Fullscreen Player Controls
  document.getElementById('btnCloseFullPlayer')?.addEventListener('click', closeFullscreenPlayer);
  document.getElementById('btnFullPlayPause')?.addEventListener('click', togglePlayPause);
  document.getElementById('btnFullRewind')?.addEventListener('click', () => seekRelative(-10));
  document.getElementById('btnFullForward')?.addEventListener('click', () => seekRelative(10));

  document.getElementById('fullPlayerProgressBar')?.addEventListener('input', (e) => {
    const percent = parseFloat(e.target.value);
    state.currentTime = (percent / 100) * state.duration;
    updatePlayerTimeline();
  });

  // Speed chips
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => {
        b.className = 'speed-btn px-2 py-1 rounded-lg bg-slate-800 text-[10px] font-bold text-slate-300';
      });
      btn.className = 'speed-btn active px-2 py-1 rounded-lg bg-sky-500 text-[10px] font-bold text-white';
      state.playbackSpeed = parseFloat(btn.dataset.speed);
    });
  });

  document.getElementById('btnFullViewScript')?.addEventListener('click', () => {
    if (state.activeChannel) {
      openScriptSheetForChannel(state.activeChannel.id);
    }
  });

  document.getElementById('btnShareBroadcast')?.addEventListener('click', () => {
    if (navigator.share && state.activeChannel) {
      navigator.share({
        title: state.activeChannel.name,
        text: `Đang nghe bản tin Radio VN: ${state.activeChannel.name}`,
        url: window.location.href
      }).catch(() => {});
    } else {
      showToast('Đã sao chép link kênh phát thanh!', 'info');
    }
  });

  // Sample prompt pills in Step 1 (Thẻ Gợi Ý Nhanh Tự Động Điền)
  document.querySelectorAll('.sample-prompt-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      // Bỏ active của các thẻ khác
      document.querySelectorAll('.sample-prompt-pill').forEach(p => {
        p.classList.remove('ring-2', 'ring-sky-400', 'bg-sky-500/20', 'text-sky-200');
        p.classList.add('bg-slate-800/90', 'text-slate-300');
      });

      // Kích hoạt style cho thẻ đang chọn
      pill.classList.remove('bg-slate-800/90', 'text-slate-300');
      pill.classList.add('ring-2', 'ring-sky-400', 'bg-sky-500/20', 'text-sky-200');

      const pInput = document.getElementById('wizPrompt');
      if (pInput) {
        pInput.value = pill.dataset.text;
        state.wizard.prompt = pill.dataset.text;
        state.wizard.isPromptValidated = false;
        
        // Ẩn hộp kết quả cũ để nhắc bấm gửi duyệt
        const valBox = document.getElementById('promptValidationBox');
        if (valBox) valBox.classList.add('hidden');

        // Focus vào textarea để người dùng tiện xem
        pInput.focus();
        showToast('Đã điền mẫu Prompt! Bấm "Gửi Prompt Để AI Duyệt" nhé.', 'info');
      }
    });
  });

  // BƯỚC 1: Nút "Gửi Prompt Để AI Duyệt"
  document.getElementById('btnValidatePrompt')?.addEventListener('click', handleValidatePrompt);

  // Wizard Step Navigation
  document.getElementById('btnWizNext')?.addEventListener('click', () => {
    const step = state.wizard.currentStep;

    // Validate Step 1
    if (step === 1) {
      const promptInput = document.getElementById('wizPrompt');
      const promptText = promptInput ? promptInput.value.trim() : '';

      if (!promptText) {
        showToast('Vui lòng nhập mô tả Prompt cho kênh', 'warning');
        return;
      }

      if (!state.wizard.isPromptValidated) {
        showToast('Vui lòng bấm nút "Gửi Prompt Để AI Kiểm Tra & Duyệt" trước khi tiếp tục!', 'warning');
        return;
      }

      const nameInput = document.getElementById('wizChannelName');
      state.wizard.channelName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : state.wizard.channelName;
    }

    // Validate Step 2
    if (step === 2) {
      if (state.wizard.sources.length === 0) {
        showToast('Vui lòng giữ ít nhất 1 nguồn báo chí chính thống', 'warning');
        return;
      }
    }

    // Validate Step 3
    if (step === 3) {
      const bMode = document.querySelector('input[name="wizBroadcastMode"]:checked')?.value || 'live';
      state.wizard.broadcastMode = bMode;
    }

    if (state.wizard.currentStep < 4) {
      state.wizard.currentStep += 1;
      updateWizardStepView();
    }
  });

  document.getElementById('btnWizPrev')?.addEventListener('click', () => {
    if (state.wizard.currentStep > 1) {
      state.wizard.currentStep -= 1;
      updateWizardStepView();
    }
  });

  document.getElementById('btnCloseWizard')?.addEventListener('click', closeWizardModal);
  document.getElementById('btnWizFinish')?.addEventListener('click', submitCreateChannel);
  document.getElementById('btnCheckWhitelist')?.addEventListener('click', checkCustomUrlWhitelist);

  // Script Sheet Close & Copy
  document.getElementById('btnCloseScriptSheet')?.addEventListener('click', closeScriptSheet);
  document.getElementById('btnCopyScriptSheet')?.addEventListener('click', () => {
    const text = document.getElementById('scriptSheetContent')?.innerText || '';
    if (text) {
      navigator.clipboard.writeText(text);
      showToast('Đã sao chép kịch bản phát thanh!', 'success');
    }
  });

  // Profile Logout Button
  document.getElementById('btnProfileLogout')?.addEventListener('click', handleLogout);

  // Profile Options: Giọng Đọc AI MC, Whitelist Báo Chí, Chế Độ Tối
  document.getElementById('profItemVoices')?.addEventListener('click', openVoicesModal);
  document.getElementById('btnCloseVoicesSheet')?.addEventListener('click', closeVoicesModal);
  document.getElementById('btnConfirmVoicesClose')?.addEventListener('click', closeVoicesModal);
  document.getElementById('voicesBottomSheet')?.addEventListener('click', (e) => {
    if (e.target.id === 'voicesBottomSheet') closeVoicesModal();
  });

  document.getElementById('profItemWhitelist')?.addEventListener('click', openWhitelistModal);
  document.getElementById('btnCloseWhitelistSheet')?.addEventListener('click', closeWhitelistModal);
  document.getElementById('btnConfirmWhitelistClose')?.addEventListener('click', closeWhitelistModal);
  document.getElementById('whitelistBottomSheet')?.addEventListener('click', (e) => {
    if (e.target.id === 'whitelistBottomSheet') closeWhitelistModal();
  });

  document.getElementById('profItemDarkMode')?.addEventListener('click', toggleDarkMode);


  // Filter Tabs on My Channels Screen
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setMyChannelsFilter(tab.dataset.filter);
    });
  });

  document.getElementById('mobileSearchInput')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderChannelsList();
  });
});
