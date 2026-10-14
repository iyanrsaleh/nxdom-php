/**
 * Spinner utility untuk menampilkan loading indicator
 * Dapat digunakan di berbagai tempat melalui NXUI.spinner()
 * 
 * @param {Object|string} options - Konfigurasi spinner atau selector/ID element
 * @param {string} options.target - Selector atau ID element target (default: 'body' untuk overlay)
 * @param {string} options.type - Tipe spinner: 'overlay' | 'inline' | 'button' (default: 'overlay')
 * @param {string} options.size - Ukuran: 'small' | 'medium' | 'large' (default: 'medium')
 * @param {string} options.color - Warna spinner (default: '#007bff')
 * @param {string} options.message - Pesan yang ditampilkan (optional)
 * @param {boolean} options.autoShow - Otomatis tampilkan saat dibuat (default: false)
 * @param {string} options.position - Posisi untuk inline: 'center' | 'top' | 'bottom' (default: 'center')
 * 
 * @returns {Object} Object dengan method show(), hide(), toggle(), destroy()
 * 
 * @example
 * // Overlay spinner (full screen)
 * const sp = NXUI.spinner();
 * sp.show();
 * // ... do something
 * sp.hide();
 * 
 * @example
 * // Spinner dalam container tertentu
 * const sp = NXUI.spinner({ target: '#myContainer', type: 'inline' });
 * sp.show();
 * 
 * @example
 * // Spinner dengan pesan
 * const sp = NXUI.spinner({ message: 'Loading...', autoShow: true });
 * 
 * @example
 * // Spinner untuk button
 * const sp = NXUI.spinner({ target: '#submitBtn', type: 'button' });
 * sp.show();
 */
export function spinner(options = {}) {
  // Jika options adalah string, treat sebagai target selector
  if (typeof options === 'string') {
    options = { target: options };
  }

  // Default options
  const config = {
    target: 'body',
    type: 'overlay', // 'overlay' | 'inline' | 'button'
    size: 'medium', // 'small' | 'medium' | 'large'
    color: '#007bff',
    message: '',
    autoShow: false,
    position: 'center', // 'center' | 'top' | 'bottom'
    ...options
  };

  // Generate unique ID untuk spinner
  const spinnerId = `nxui-spinner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  let spinnerElement = null;
  let targetElement = null;
  let originalContent = null;
  let isVisible = false;

  // Get target element
  const getTarget = () => {
    if (targetElement) return targetElement;

    // Jika target sudah berupa DOM element, gunakan langsung
    if (config.target instanceof Element || config.target instanceof HTMLElement) {
      targetElement = config.target;
      return targetElement;
    }

    if (config.target === 'body' || config.target === document.body) {
      targetElement = document.body;
    } else {
      // Try as selector
      targetElement = document.querySelector(config.target);
      // Try as ID
      if (!targetElement && config.target.startsWith('#')) {
        targetElement = document.getElementById(config.target.substring(1));
      } else if (!targetElement && !config.target.startsWith('#')) {
        targetElement = document.getElementById(config.target);
      }
    }

    if (!targetElement) {
      console.warn(`NXUI.spinner: Target element "${config.target}" not found`);
      targetElement = document.body; // Fallback to body
    }

    return targetElement;
  };

  // Get size classes
  const getSizeClass = () => {
    const sizes = {
      small: '20px',
      medium: '40px',
      large: '60px'
    };
    return sizes[config.size] || sizes.medium;
  };

  // Create spinner HTML
  const createSpinnerHTML = () => {
    const size = getSizeClass();
    const spinnerHTML = `
      <div id="${spinnerId}" class="nxui-spinner" style="
        display: none;
        ${config.type === 'overlay' ? `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: transparent;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          pointer-events: none;
        ` : config.type === 'inline' ? `
          position: relative;
          width: 100%;
          min-height: ${size};
          display: flex;
          align-items: ${config.position === 'top' ? 'flex-start' : config.position === 'bottom' ? 'flex-end' : 'center'};
          justify-content: center;
          padding: 20px;
        ` : `
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        `}
      ">
        <div class="nxui-spinner-loader" style="
          width: ${size};
          height: ${size};
          border: 4px solid rgba(0, 0, 0, 0.1);
          border-top-color: ${config.color};
          border-radius: 50%;
          animation: nxui-spin 1s linear infinite;
        "></div>
        ${config.message ? `
          <div class="nxui-spinner-message" style="
            margin-top: 15px;
            color: ${config.type === 'overlay' ? '#333' : '#333'};
            font-size: 14px;
            text-align: center;
          ">${config.message}</div>
        ` : ''}
      </div>
    `;
    return spinnerHTML;
  };

  // Inject CSS jika belum ada
  const injectCSS = () => {
    if (document.getElementById('nxui-spinner-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'nxui-spinner-styles';
    style.textContent = `
      @keyframes nxui-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .nxui-spinner {
        box-sizing: border-box;
      }
      .nxui-spinner-loader {
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(style);
  };

  // Show spinner
  const show = () => {
    if (isVisible) return;
    
    injectCSS();
    const target = getTarget();
    
    if (config.type === 'overlay') {
      // Overlay: append to body
      if (!spinnerElement) {
        spinnerElement = document.createElement('div');
        spinnerElement.innerHTML = createSpinnerHTML();
        spinnerElement = spinnerElement.firstElementChild;
        document.body.appendChild(spinnerElement);
      }
      spinnerElement.style.display = 'flex';
    } else if (config.type === 'inline') {
      // Inline: append to target
      if (!spinnerElement) {
        spinnerElement = document.createElement('div');
        spinnerElement.innerHTML = createSpinnerHTML();
        spinnerElement = spinnerElement.firstElementChild;
        target.appendChild(spinnerElement);
      }
      spinnerElement.style.display = 'flex';
    } else if (config.type === 'button') {
      // Button: replace content temporarily
      if (!spinnerElement) {
        originalContent = target.innerHTML;
        const size = getSizeClass();
        target.style.position = 'relative';
        target.disabled = true;
        target.innerHTML = `
          <div class="nxui-spinner" style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: ${size};
            height: ${size};
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: nxui-spin 1s linear infinite;
          "></div>
          <span style="opacity: 0.5;">${originalContent}</span>
        `;
        spinnerElement = target.querySelector('.nxui-spinner');
      }
      spinnerElement.style.display = 'block';
    }
    
    isVisible = true;
  };

  // Hide spinner
  const hide = () => {
    if (!isVisible) return;
    
    if (spinnerElement) {
      if (config.type === 'button' && originalContent) {
        // Restore original button content
        const target = getTarget();
        target.innerHTML = originalContent;
        target.disabled = false;
        spinnerElement = null;
        originalContent = null;
      } else {
        spinnerElement.style.display = 'none';
      }
    }
    
    isVisible = false;
  };

  // Toggle spinner
  const toggle = () => {
    if (isVisible) {
      hide();
    } else {
      show();
    }
  };

  // Destroy spinner (remove from DOM)
  const destroy = () => {
    hide();
    if (spinnerElement && spinnerElement.parentNode) {
      spinnerElement.parentNode.removeChild(spinnerElement);
      spinnerElement = null;
    }
    if (config.type === 'button' && originalContent) {
      const target = getTarget();
      target.innerHTML = originalContent;
      target.disabled = false;
      originalContent = null;
    }
  };

  // Auto show jika diminta
  if (config.autoShow) {
    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', show);
    } else {
      setTimeout(show, 0);
    }
  }

  // Return API
  return {
    show,
    hide,
    toggle,
    destroy,
    isVisible: () => isVisible,
    getElement: () => spinnerElement
  };
}

// Assign spinner to NXUI if available (for backward compatibility)
if (typeof window !== "undefined" && window.NXUI) {
  window.NXUI.spinner = spinner;
}

