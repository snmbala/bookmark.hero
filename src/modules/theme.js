// Theme management functionality
export function updateSettingsIconColor() {
    const html = document.documentElement;
    const settingsIcon = document.getElementById('settings-icon-svg');
    if (!settingsIcon) return;
    
    if (html.classList.contains('dark')) {
        settingsIcon.querySelectorAll('path').forEach(p => {
            p.setAttribute('stroke', '#a5b4fc'); // indigo-200
        });
    } else {
        settingsIcon.querySelectorAll('path').forEach(p => {
            p.setAttribute('stroke', '#4f46e5'); // indigo-700
        });
    }
}

export function initializeTheme() {
    function setTheme(theme, updateStorage = true) {
        // Update button states with new styling
        document.querySelectorAll('.theme-button').forEach(button => {
            const isActive = button.dataset.theme === theme;
            
            if (isActive) {
                button.classList.add('bg-indigo-50', 'border-indigo-400', 'text-zinc-900', 'dark:bg-indigo-500/10', 'dark:border-indigo-500', 'dark:text-zinc-100');
                button.classList.remove('text-zinc-600', 'border-zinc-200', 'dark:text-zinc-400', 'dark:border-zinc-700');
            } else {
                button.classList.remove('bg-indigo-50', 'border-indigo-400', 'text-zinc-900', 'dark:bg-indigo-500/10', 'dark:border-indigo-500', 'dark:text-zinc-100');
                button.classList.add('text-zinc-600', 'border-zinc-200', 'dark:text-zinc-400', 'dark:border-zinc-700');
            }
        });

        // Apply theme
        if (theme === 'system') {
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.classList.toggle('dark', systemDark);
        } else {
            document.documentElement.classList.toggle('dark', theme === 'dark');
        }

        // Save preference
        if (updateStorage) {
            chrome.storage.sync.set({ theme });
        }
    }

    // Initialize theme on load
    chrome.storage.sync.get(['theme'], function(result) {
        const currentTheme = result.theme || 'system';
        setTheme(currentTheme, false);
    });

    // Theme button click handlers
    document.querySelectorAll('.theme-button').forEach(button => {
        button.addEventListener('click', () => {
            setTheme(button.dataset.theme);
        });
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        chrome.storage.sync.get(['theme'], function(result) {
            if (result.theme === 'system') {
                setTheme('system', false);
            }
        });
    });
}

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
            if (
                (mode === 'auto' && b.getAttribute('data-theme') === 'auto') ||
                (mode === 'light' && b.getAttribute('data-theme') === 'light') ||
                (mode === 'dark' && b.getAttribute('data-theme') === 'dark')
            ) {
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
        // Update settings icon color after theme change
        updateSettingsIconColor();
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

export function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    
    // Apply theme
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    
    // Update settings icon
    updateSettingsIconColor();
    
    // Save preference
    chrome.storage.sync.set({ theme: newTheme });
}
