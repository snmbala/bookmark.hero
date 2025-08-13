const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
	darkMode: 'class', // Enable class-based dark mode
	content: [
		"./src/**/*.{html,js}",
		"./css/**/*.{css}",
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
};
