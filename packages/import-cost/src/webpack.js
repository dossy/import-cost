const webpack = require('webpack');
const MemoryFS = require('memory-fs');
const pkgDir = require('pkg-dir');
const tempy = require('tempy');
const fs = require('fs');
const path = require('path');
const { gzipSync } = require('zlib');
const { getPackageJson, getPackageModuleContainer } = require('./utils.js');

function getEntryPoint(packageInfo) {
  const tmpFile = tempy.file({ extension: 'js' });
  fs.writeFileSync(tmpFile, packageInfo.string, 'utf-8');
  return tmpFile;
}

function calcSize(packageInfo, callback) {
  const entryPoint = getEntryPoint(packageInfo);
  const packageRootDir = pkgDir.sync(path.dirname(packageInfo.fileName));
  const modulesDirectory = path.join(packageRootDir, 'node_modules');
  const peers = getPackageJson(packageInfo).peerDependencies || {};
  const defaultExternals = ['react', 'react-dom'];
  const externals = Object.keys(peers)
    .concat(defaultExternals)
    .filter(p => p !== packageInfo.name);
  const compiler = webpack({
    entry: entryPoint,
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
      new webpack.optimize.ModuleConcatenationPlugin(),
      new webpack.IgnorePlugin({ resourceRegExp: /^electron$/ }),
    ],
    resolve: {
      modules: [
        modulesDirectory,
        getPackageModuleContainer(packageInfo),
        'node_modules',
      ],
      fallback: {
        fs: false,
        os: false,
        tls: false,
        net: false,
        url: false,
        path: false,
        util: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        buffer: false,
        stream: false,
        crypto: false,
        constants: false,
        child_process: false,
        worker_threads: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.s?css$/,
          use: 'css-loader',
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|wav)(\?.*)?$/,
          loader: 'url-loader',
          options: {
            name: '[path][name].[ext]?[hash]',
            limit: 10000,
          },
        },
      ],
    },
    node: {
      global: true,
      __dirname: true,
      __filename: true,
    },
    externals,
    output: {
      filename: 'bundle.js',
      libraryTarget: 'commonjs2',
    },
  });
  const memoryFileSystem = new MemoryFS();
  compiler.outputFileSystem = memoryFileSystem;

  compiler.run((err, stats) => {
    if (err || stats.toJson().errors.length > 0) {
      callback({ err: err || stats.toJson().errors });
    } else {
      const bundles = stats
        .toJson()
        .assets.filter(asset => asset.name.includes('bundle.js'));
      const size = bundles.reduce((sum, pkg) => sum + pkg.size, 0);
      const gzip = bundles
        .map(bundle => path.join(process.cwd(), 'dist', bundle.name))
        .map(
          bundleFile =>
            gzipSync(memoryFileSystem.readFileSync(bundleFile), {}).length,
        )
        .reduce((sum, gzipSize) => sum + gzipSize, 0);
      callback(null, { size, gzip });
    }
  });
}

module.exports = {
  calcSize,
};
