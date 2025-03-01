"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.graphToSerialAssetsAsync = graphToSerialAssetsAsync;
function _assert() {
  const data = _interopRequireDefault(require("assert"));
  _assert = function () {
    return data;
  };
  return data;
}
function _getAssets() {
  const data = _interopRequireDefault(require("metro/src/DeltaBundler/Serializers/getAssets"));
  _getAssets = function () {
    return data;
  };
  return data;
}
function _sourceMapString() {
  const data = _interopRequireDefault(require("metro/src/DeltaBundler/Serializers/sourceMapString"));
  _sourceMapString = function () {
    return data;
  };
  return data;
}
function _bundleToString() {
  const data = _interopRequireDefault(require("metro/src/lib/bundleToString"));
  _bundleToString = function () {
    return data;
  };
  return data;
}
function _path() {
  const data = _interopRequireDefault(require("path"));
  _path = function () {
    return data;
  };
  return data;
}
function _pathToRegexp() {
  const data = _interopRequireDefault(require("path-to-regexp"));
  _pathToRegexp = function () {
    return data;
  };
  return data;
}
function _exportHermes() {
  const data = require("./exportHermes");
  _exportHermes = function () {
    return data;
  };
  return data;
}
function _exportPath() {
  const data = require("./exportPath");
  _exportPath = function () {
    return data;
  };
  return data;
}
function _baseJSBundle() {
  const data = require("./fork/baseJSBundle");
  _baseJSBundle = function () {
    return data;
  };
  return data;
}
function _getCssDeps() {
  const data = require("./getCssDeps");
  _getCssDeps = function () {
    return data;
  };
  return data;
}
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
async function graphToSerialAssetsAsync(config, serializeChunkOptions, ...props) {
  var _config$serializer, _config$transformer$a, _config$transformer, _getPlatformOption, _config$transformer$p, _config$transformer2;
  const [entryFile, preModules, graph, options] = props;
  const cssDeps = (0, _getCssDeps().getCssSerialAssets)(graph.dependencies, {
    projectRoot: options.projectRoot,
    processModuleFilter: options.processModuleFilter
  });

  // Create chunks for splitting.
  const chunks = new Set();
  [{
    test: (0, _pathToRegexp().default)(entryFile)
  }].map(chunkSettings => gatherChunks(chunks, chunkSettings, preModules, graph, options, false));

  // Get the common modules and extract them into a separate chunk.
  const entryChunk = [...chunks.values()].find(chunk => !chunk.isAsync && chunk.hasAbsolutePath(entryFile));
  if (entryChunk) {
    for (const chunk of chunks.values()) {
      if (chunk !== entryChunk && chunk.isAsync) {
        for (const dep of chunk.deps.values()) {
          if (entryChunk.deps.has(dep)) {
            // Remove the dependency from the async chunk since it will be loaded in the main chunk.
            chunk.deps.delete(dep);
          }
        }
      }
    }
    const toCompare = [...chunks.values()];
    const commonDependencies = [];
    while (toCompare.length) {
      const chunk = toCompare.shift();
      for (const chunk2 of toCompare) {
        if (chunk !== chunk2 && chunk.isAsync && chunk2.isAsync) {
          const commonDeps = [...chunk.deps].filter(dep => chunk2.deps.has(dep));
          for (const dep of commonDeps) {
            chunk.deps.delete(dep);
            chunk2.deps.delete(dep);
          }
          commonDependencies.push(...commonDeps);
        }
      }
    }

    // Add common chunk if one exists.
    if (commonDependencies.length) {
      const commonDependenciesUnique = [...new Set(commonDependencies)];
      const commonChunk = new Chunk(chunkIdForModules(commonDependenciesUnique), commonDependenciesUnique, graph, options, false, true);
      entryChunk.requiredChunks.add(commonChunk);
      chunks.add(commonChunk);
    }
  }
  const jsAssets = await serializeChunksAsync(chunks, (_config$serializer = config.serializer) !== null && _config$serializer !== void 0 ? _config$serializer : {}, serializeChunkOptions);

  // TODO: Convert to serial assets
  // TODO: Disable this call dynamically in development since assets are fetched differently.
  const metroAssets = await (0, _getAssets().default)(graph.dependencies, {
    processModuleFilter: options.processModuleFilter,
    assetPlugins: (_config$transformer$a = (_config$transformer = config.transformer) === null || _config$transformer === void 0 ? void 0 : _config$transformer.assetPlugins) !== null && _config$transformer$a !== void 0 ? _config$transformer$a : [],
    platform: (_getPlatformOption = (0, _baseJSBundle().getPlatformOption)(graph, options)) !== null && _getPlatformOption !== void 0 ? _getPlatformOption : 'web',
    projectRoot: options.projectRoot,
    // this._getServerRootDir(),
    publicPath: (_config$transformer$p = (_config$transformer2 = config.transformer) === null || _config$transformer2 === void 0 ? void 0 : _config$transformer2.publicPath) !== null && _config$transformer$p !== void 0 ? _config$transformer$p : '/'
  });
  return {
    artifacts: [...jsAssets, ...cssDeps],
    assets: metroAssets
  };
}
class Chunk {
  constructor(name, entries, graph, options, isAsync = false, isVendor = false) {
    this.name = name;
    this.entries = entries;
    this.graph = graph;
    this.options = options;
    this.isAsync = isAsync;
    this.isVendor = isVendor;
    _defineProperty(this, "deps", new Set());
    _defineProperty(this, "preModules", new Set());
    // Chunks that are required to be loaded synchronously before this chunk.
    // These are included in the HTML as <script> tags.
    _defineProperty(this, "requiredChunks", new Set());
    this.deps = new Set(entries);
  }
  getPlatform() {
    (0, _assert().default)(this.graph.transformOptions.platform, "platform is required to be in graph's transformOptions");
    return this.graph.transformOptions.platform;
  }
  getFilename(src) {
    return this.options.dev ? this.name : (0, _exportPath().getExportPathForDependencyWithOptions)(this.name, {
      platform: this.getPlatform(),
      src,
      serverRoot: this.options.serverRoot
    });
  }
  getFilenameForConfig(serializerConfig) {
    return this.getFilename(this.options.dev ? '' : this.serializeToCodeWithTemplates(serializerConfig, {
      // Disable source maps when creating a sha to reduce the number of possible changes that could
      // influence the cache hit.
      serializerOptions: {
        includeSourceMaps: false
      },
      sourceMapUrl: undefined
    }));
  }
  serializeToCodeWithTemplates(serializerConfig, options = {}) {
    var _serializerConfig$get, _serializerConfig$get2;
    const entryFile = this.name;
    const jsSplitBundle = (0, _baseJSBundle().baseJSBundleWithDependencies)(entryFile, [...this.preModules.values()], [...this.deps], {
      ...this.options,
      runBeforeMainModule: (_serializerConfig$get = serializerConfig === null || serializerConfig === void 0 ? void 0 : (_serializerConfig$get2 = serializerConfig.getModulesRunBeforeMainModule) === null || _serializerConfig$get2 === void 0 ? void 0 : _serializerConfig$get2.call(serializerConfig, _path().default.relative(this.options.projectRoot, entryFile))) !== null && _serializerConfig$get !== void 0 ? _serializerConfig$get : [],
      runModule: !this.isVendor && !this.isAsync,
      modulesOnly: this.preModules.size === 0,
      platform: this.getPlatform(),
      baseUrl: (0, _baseJSBundle().getBaseUrlOption)(this.graph, this.options),
      splitChunks: (0, _baseJSBundle().getSplitChunksOption)(this.graph, this.options),
      skipWrapping: true,
      computedAsyncModulePaths: null,
      ...options
    });
    return (0, _bundleToString().default)(jsSplitBundle).code;
  }
  hasAbsolutePath(absolutePath) {
    return [...this.deps].some(module => module.path === absolutePath);
  }
  getComputedPathsForAsyncDependencies(serializerConfig, chunks) {
    const baseUrl = (0, _baseJSBundle().getBaseUrlOption)(this.graph, this.options);
    // Only calculate production paths when all chunks are being exported.
    if (this.options.includeAsyncPaths) {
      return null;
    }
    const computedAsyncModulePaths = {};
    this.deps.forEach(module => {
      module.dependencies.forEach(dependency => {
        if (dependency.data.data.asyncType === 'async') {
          const chunkContainingModule = chunks.find(chunk => chunk.hasAbsolutePath(dependency.absolutePath));
          (0, _assert().default)(chunkContainingModule, 'Chunk containing module not found: ' + dependency.absolutePath);
          const moduleIdName = chunkContainingModule.getFilenameForConfig(serializerConfig);
          computedAsyncModulePaths[dependency.absolutePath] = (baseUrl !== null && baseUrl !== void 0 ? baseUrl : '/') + moduleIdName;
        }
      });
    });
    return computedAsyncModulePaths;
  }
  getAdjustedSourceMapUrl(serializerConfig) {
    var _this$options$seriali;
    // Metro really only accounts for development, so we'll use the defaults here.
    if (this.options.dev) {
      var _this$options$sourceM;
      return (_this$options$sourceM = this.options.sourceMapUrl) !== null && _this$options$sourceM !== void 0 ? _this$options$sourceM : null;
    }
    if (((_this$options$seriali = this.options.serializerOptions) === null || _this$options$seriali === void 0 ? void 0 : _this$options$seriali.includeSourceMaps) !== true) {
      return null;
    }
    if (this.options.inlineSourceMap || !this.options.sourceMapUrl) {
      var _this$options$sourceM2;
      return (_this$options$sourceM2 = this.options.sourceMapUrl) !== null && _this$options$sourceM2 !== void 0 ? _this$options$sourceM2 : null;
    }
    const isAbsolute = this.getPlatform() !== 'web';
    const baseUrl = (0, _baseJSBundle().getBaseUrlOption)(this.graph, this.options);
    const filename = this.getFilenameForConfig(serializerConfig);
    const isAbsoluteBaseUrl = !!(baseUrl !== null && baseUrl !== void 0 && baseUrl.match(/https?:\/\//));
    const pathname = (isAbsoluteBaseUrl ? '' : baseUrl.replace(/\/+$/, '')) + '/' + filename.replace(/^\/+$/, '') + '.map';
    let adjustedSourceMapUrl = this.options.sourceMapUrl;
    // Metro has lots of issues...
    if (this.options.sourceMapUrl.startsWith('//localhost')) {
      adjustedSourceMapUrl = 'http:' + this.options.sourceMapUrl;
    }
    try {
      const parsed = new URL(pathname, isAbsoluteBaseUrl ? baseUrl : adjustedSourceMapUrl);
      if (isAbsoluteBaseUrl || isAbsolute) {
        return parsed.href;
      }
      return parsed.pathname;
    } catch (error) {
      console.error(`Failed to link source maps because the source map URL "${this.options.sourceMapUrl}" is corrupt:`, error);
      return null;
    }
  }
  serializeToCode(serializerConfig, chunks) {
    var _this$getAdjustedSour;
    return this.serializeToCodeWithTemplates(serializerConfig, {
      skipWrapping: false,
      sourceMapUrl: (_this$getAdjustedSour = this.getAdjustedSourceMapUrl(serializerConfig)) !== null && _this$getAdjustedSour !== void 0 ? _this$getAdjustedSour : undefined,
      computedAsyncModulePaths: this.getComputedPathsForAsyncDependencies(serializerConfig, chunks)
    });
  }
  async serializeToAssetsAsync(serializerConfig, chunks, {
    includeSourceMaps,
    includeBytecode
  }) {
    const jsCode = this.serializeToCode(serializerConfig, chunks);
    const relativeEntry = _path().default.relative(this.options.projectRoot, this.name);
    const outputFile = this.getFilenameForConfig(
    // Create hash without wrapping to prevent it changing when the wrapping changes.
    serializerConfig);
    const jsAsset = {
      filename: outputFile,
      originFilename: relativeEntry,
      type: 'js',
      metadata: {
        isAsync: this.isAsync,
        requires: [...this.requiredChunks.values()].map(chunk => chunk.getFilenameForConfig(serializerConfig))
      },
      source: jsCode
    };
    const assets = [jsAsset];
    if (
    // Only include the source map if the `options.sourceMapUrl` option is provided and we are exporting a static build.
    includeSourceMaps && !this.options.inlineSourceMap && this.options.sourceMapUrl) {
      const modules = [...this.preModules, ...getSortedModules([...this.deps], {
        createModuleId: this.options.createModuleId
      })].map(module => {
        // TODO: Make this user-configurable.

        // Make all paths relative to the server root to prevent the entire user filesystem from being exposed.
        if (module.path.startsWith('/')) {
          var _this$options$serverR;
          return {
            ...module,
            path: '/' + _path().default.relative((_this$options$serverR = this.options.serverRoot) !== null && _this$options$serverR !== void 0 ? _this$options$serverR : this.options.projectRoot, module.path)
          };
        }
        return module;
      });
      const sourceMap = (0, _sourceMapString().default)(modules, {
        excludeSource: false,
        ...this.options
      });
      assets.push({
        filename: this.options.dev ? jsAsset.filename + '.map' : outputFile + '.map',
        originFilename: jsAsset.originFilename,
        type: 'map',
        metadata: {},
        source: sourceMap
      });
    }
    if (includeBytecode && this.isHermesEnabled()) {
      const adjustedSource = jsAsset.source.replace(/^\/\/# (sourceMappingURL)=(.*)$/gm, (...props) => {
        if (props[1] === 'sourceMappingURL') {
          const mapName = props[2].replace(/\.js\.map$/, '.hbc.map');
          return `//# ${props[1]}=` + mapName;
        }
        return '';
      });

      // TODO: Generate hbc for each chunk
      const hermesBundleOutput = await (0, _exportHermes().buildHermesBundleAsync)({
        filename: this.name,
        code: adjustedSource,
        map: assets[1] ? assets[1].source : null,
        // TODO: Maybe allow prod + no minify.
        minify: true //!this.options.dev,
      });

      if (hermesBundleOutput.hbc) {
        // TODO: Unclear if we should add multiple assets, link the assets, or mutate the first asset.
        // jsAsset.metadata.hbc = hermesBundleOutput.hbc;
        // @ts-expect-error: TODO
        jsAsset.source = hermesBundleOutput.hbc;
        jsAsset.filename = jsAsset.filename.replace(/\.js$/, '.hbc');
      }
      if (assets[1] && hermesBundleOutput.sourcemap) {
        assets[1].source = hermesBundleOutput.sourcemap;
        assets[1].filename = assets[1].filename.replace(/\.js\.map$/, '.hbc.map');
      }
    }
    return assets;
  }
  supportsBytecode() {
    return this.getPlatform() !== 'web';
  }
  isHermesEnabled() {
    var _this$graph$transform;
    // TODO: Revisit.
    // TODO: There could be an issue with having the serializer for export:embed output hermes since the native scripts will
    // also create hermes bytecode. We may need to disable in one of the two places.
    return !this.options.dev && this.supportsBytecode() && ((_this$graph$transform = this.graph.transformOptions.customTransformOptions) === null || _this$graph$transform === void 0 ? void 0 : _this$graph$transform.engine) === 'hermes';
  }
}
function getEntryModulesForChunkSettings(graph, settings) {
  return [...graph.dependencies.entries()].filter(([path]) => settings.test.test(path)).map(([, module]) => module);
}
function chunkIdForModules(modules) {
  return modules.map(module => module.path).sort().join('=>');
}
function gatherChunks(chunks, settings, preModules, graph, options, isAsync = false) {
  let entryModules = getEntryModulesForChunkSettings(graph, settings);
  const existingChunks = [...chunks.values()];
  entryModules = entryModules.filter(module => {
    return !existingChunks.find(chunk => chunk.entries.includes(module));
  });

  // Prevent processing the same entry file twice.
  if (!entryModules.length) {
    return chunks;
  }
  const entryChunk = new Chunk(chunkIdForModules(entryModules), entryModules, graph, options, isAsync);

  // Add all the pre-modules to the first chunk.
  if (preModules.length) {
    // On native, use the preModules in insert code in the entry chunk.
    for (const module of preModules.values()) {
      entryChunk.preModules.add(module);
    }
  }
  chunks.add(entryChunk);
  const splitChunks = (0, _baseJSBundle().getSplitChunksOption)(graph, options);
  function includeModule(entryModule) {
    for (const dependency of entryModule.dependencies.values()) {
      if (dependency.data.data.asyncType === 'async' &&
      // Support disabling multiple chunks.
      splitChunks) {
        gatherChunks(chunks, {
          test: (0, _pathToRegexp().default)(dependency.absolutePath)
        }, [], graph, options, true);
      } else {
        const module = graph.dependencies.get(dependency.absolutePath);
        if (module) {
          // Prevent circular dependencies from creating infinite loops.
          if (!entryChunk.deps.has(module)) {
            entryChunk.deps.add(module);
            includeModule(module);
          }
        }
      }
    }
  }
  for (const entryModule of entryModules) {
    includeModule(entryModule);
  }
  return chunks;
}
async function serializeChunksAsync(chunks, serializerConfig, {
  includeSourceMaps,
  includeBytecode
}) {
  const jsAssets = [];
  const chunksArray = [...chunks.values()];
  await Promise.all(chunksArray.map(async chunk => {
    jsAssets.push(...(await chunk.serializeToAssetsAsync(serializerConfig, chunksArray, {
      includeSourceMaps,
      includeBytecode
    })));
  }));
  return jsAssets;
}
function getSortedModules(modules, {
  createModuleId
}) {
  // Assign IDs to modules in a consistent order
  for (const module of modules) {
    createModuleId(module.path);
  }
  // Sort by IDs
  return modules.sort((a, b) => createModuleId(a.path) - createModuleId(b.path));
}
//# sourceMappingURL=serializeChunks.js.map