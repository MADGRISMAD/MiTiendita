const path = require('path');
const webpack = require('webpack');
module.exports = {
  mode: 'production',
  entry: './app.js',
  output: {
    path: path.join(__dirname, 'dist'),
    publicPath: '/',
    filename: 'server.js',
  },
  target: 'node',
  plugins: [
    // pg intenta cargar su versión nativa opcional; no se usa
    new webpack.IgnorePlugin({ resourceRegExp: /^pg-native$/ }),
    new webpack.DefinePlugin({
      'process.env': {
        PORT: JSON.stringify(process.env.PORT),
        SECRET_KEY: JSON.stringify(process.env.SECRET_KEY),
        DATABASE_URL: JSON.stringify(process.env.DATABASE_URL),
        DATABASE_SCHEMA: JSON.stringify(process.env.DATABASE_SCHEMA),
      },
    }),
  ],
};