const path = require('path');
const BundleAnalyzerPlugin =
	require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
	entry: './src/main.js',
	output: {
		filename: 'index.js',
		path: path.resolve(__dirname, 'dist'),
		library: 'meteor_mongo_files',
	},
	resolve: {
		fallback: {
			fs: false,
			stream: false,
			buffer: false,
			path: false,
			util: false,
			os: false,
			crypto: false,
		},
	},
	plugins: [new BundleAnalyzerPlugin()],
};
