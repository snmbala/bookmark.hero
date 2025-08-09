const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
	content: ["./**/*.{html,js}", "./*.{html,js}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter", ...defaultTheme.fontFamily.sans],
			},
		},
	},
	plugins: [],
};
