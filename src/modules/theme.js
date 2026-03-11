// Theme management functionality

export function initializeThemeToggle() {
    const buttons = document.querySelectorAll('.theme-toggle-btn');
    if (!buttons.length) return;
    const html = document.documentElement;

    function getTheme(cb) {
        if (chrome?.storage?.sync) {
            chrome.storage.sync.get(['appearanceMode'], res => cb(res.appearanceMode || 'auto'));
        } else {
            cb(localStorage.getItem('appearanceMode') || 'auto');
        }
    }
    
    function setTheme(mode) {
        if (chrome?.storage?.sync) {
            chrome.storage.sync.set({ appearanceMode: mode });
        } else {
            localStorage.setItem('appearanceMode', mode);
        }
    }

    function setActive(mode) {
        buttons.forEach((b, i) => {
            b.classList.remove(
                'bg-indigo-50', 'border-2', 'border-indigo-400', 'text-indigo-700',
                'bg-white', 'text-zinc-500', 'dark:bg-indigo-500/10', 'dark:border-indigo-400', 'dark:text-indigo-200',
                'dark:bg-zinc-700', 'dark:text-zinc-300', 'rounded-l-md', 'rounded-r-md'
            );
            // Default state
            b.classList.add('bg-white', 'text-zinc-500', 'dark:bg-zinc-700', 'dark:text-zinc-300');
            if (i === 0) b.classList.add('rounded-l-md');
            if (i === buttons.length - 1) b.classList.add('rounded-r-md');
            // Active state
            const isActive = b.getAttribute('data-theme') === mode;
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            if (isActive) {
                b.classList.remove('bg-white', 'text-zinc-500', 'dark:bg-zinc-700', 'dark:text-zinc-300');
                b.classList.add('bg-indigo-50', 'border-2', 'border-indigo-400', 'text-indigo-700', 'dark:bg-indigo-500/10', 'dark:border-indigo-400', 'dark:text-indigo-200');
            } else {
                b.classList.remove('border-2', 'border-indigo-400', 'text-indigo-700', 'dark:bg-indigo-500/10', 'dark:border-indigo-400', 'dark:text-indigo-200');
            }
        });
    }

    function applyTheme(mode) {
        if (mode === 'dark') {
            html.classList.add('dark');
        } else if (mode === 'light') {
            html.classList.remove('dark');
        } else {
            // auto
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                html.classList.add('dark');
            } else {
                html.classList.remove('dark');
            }
        }
    }

    // Initial load
    getTheme(mode => {
        setActive(mode);
        applyTheme(mode);
    });

    // Click handlers
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-theme');
            setTheme(mode);
            setActive(mode);
            applyTheme(mode);
        });
    });

    // Listen for system theme changes if in auto mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        getTheme(mode => {
            if (mode === 'auto') applyTheme('auto');
        });
    });
}
