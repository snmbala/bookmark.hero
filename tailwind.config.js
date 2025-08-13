const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
	darkMode: 'class', // Enable class-based dark mode
	content: [
		"./src/**/*.{html,js}",
		"./css/**/*.css",
		"./*.{html,js}"
	],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter", ...defaultTheme.fontFamily.sans],
			},
		},
	},
	plugins: [],
	// Performance optimization: Enable CSS purging and minimize bundle size
	safelist: [
		// Keep commonly used utility classes that may be dynamically generated
		'hidden',
		'flex',
		'grid',
		'block',
		'dark:bg-zinc-800',
		'dark:text-zinc-50',
		'hover:bg-zinc-100',
		'dark:hover:bg-zinc-700'
	],
	experimental: {
		optimizeUniversalDefaults: true
	}
};
