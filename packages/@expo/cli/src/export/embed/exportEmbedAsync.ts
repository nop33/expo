/**
 * Copyright © 2023 650 Industries.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getConfig } from '@expo/config';
import fs from 'fs';
import { sync as globSync } from 'glob';
import Server from 'metro/src/Server';
import output from 'metro/src/shared/output/bundle';
import type { BundleOptions } from 'metro/src/shared/types';
import path from 'path';

import { Options } from './resolveOptions';
import { isExecutingFromXcodebuild, logMetroErrorInXcode } from './xcodeCompilerLogger';
import { Log } from '../../log';
import { loadMetroConfigAsync } from '../../start/server/metro/instantiateMetro';
import {
  getBaseUrlFromExpoConfig,
  getMetroDirectBundleOptions,
} from '../../start/server/middleware/metroOptions';
import { stripAnsi } from '../../utils/ansi';
import { removeAsync } from '../../utils/dir';
import { setNodeEnv } from '../../utils/nodeEnv';
import { profile } from '../../utils/profile';
import { isEnableHermesManaged } from '../exportHermes';
import { getAssets } from '../fork-bundleAsync';
import { persistMetroAssetsAsync } from '../persistMetroAssets';

const debug = require('debug')('expo:export:embed');

function guessCopiedAppleBundlePath(bundleOutput: string) {
  // Ensure the path is familiar before guessing.
  if (!bundleOutput.match(/\/Xcode\/DerivedData\/.*\/Build\/Products\//)) {
    debug('Bundling to non-standard location:', bundleOutput);
    return false;
  }
  const bundleName = path.basename(bundleOutput);
  const bundleParent = path.dirname(bundleOutput);
  const possiblePath = globSync(path.join(bundleParent, `*.app/${bundleName}`), {
    // bundle identifiers can start with dots.
    dot: true,
  })[0];
  debug('Possible path for previous bundle:', possiblePath);
  return possiblePath;
}

export async function exportEmbedAsync(projectRoot: string, options: Options) {
  setNodeEnv(options.dev ? 'development' : 'production');
  require('@expo/env').load(projectRoot);

  // Ensure we delete the old bundle to trigger a failure if the bundle cannot be created.
  await removeAsync(options.bundleOutput);

  // The iOS bundle is copied in to the Xcode project, so we need to remove the old one
  // to prevent Xcode from loading the old one after a build failure.
  if (options.platform === 'ios') {
    const previousPath = guessCopiedAppleBundlePath(options.bundleOutput);
    if (previousPath && fs.existsSync(previousPath)) {
      debug('Removing previous iOS bundle:', previousPath);
      await removeAsync(previousPath);
    }
  }

  const { bundle, assets } = await exportEmbedBundleAsync(projectRoot, options);

  fs.mkdirSync(path.dirname(options.bundleOutput), { recursive: true, mode: 0o755 });

  // Persist bundle and source maps.
  await Promise.all([
    output.save(bundle, options, Log.log),
    // NOTE(EvanBacon): This may need to be adjusted in the future if want to support baseUrl on native
    // platforms when doing production embeds (unlikely).
    options.assetsDest
      ? persistMetroAssetsAsync(assets, {
          platform: options.platform,
          outputDirectory: options.assetsDest,
          iosAssetCatalogDirectory: options.assetCatalogDest,
        })
      : null,
  ]);
}

export async function exportEmbedBundleAsync(projectRoot: string, options: Options) {
  const exp = getConfig(projectRoot, { skipSDKVersionRequirement: true }).exp;

  // TODO: This is slow ~40ms
  const { config } = await loadMetroConfigAsync(
    projectRoot,
    {
      maxWorkers: options.maxWorkers,
      resetCache: false, //options.resetCache,
      config: options.config,
    },
    {
      exp,
      isExporting: true,
    }
  );

  const isHermes = isEnableHermesManaged(exp, options.platform);

  let sourceMapUrl = options.sourcemapOutput;
  if (sourceMapUrl && !options.sourcemapUseAbsolutePath) {
    sourceMapUrl = path.basename(sourceMapUrl);
  }

  const bundleRequest = {
    ...Server.DEFAULT_BUNDLE_OPTIONS,
    ...getMetroDirectBundleOptions({
      mainModuleName: options.entryFile,
      platform: options.platform,
      minify: options.minify,
      mode: options.dev ? 'development' : 'production',
      engine: isHermes ? 'hermes' : undefined,
      baseUrl: getBaseUrlFromExpoConfig(exp),
      isExporting: true,
    }),
    sourceMapUrl,
    unstable_transformProfile: (options.unstableTransformProfile ||
      (isHermes ? 'hermes-stable' : 'default')) as BundleOptions['unstable_transformProfile'],
  };

  const server = new Server(config, {
    watch: false,
  });

  try {
    const bundle = await profile(
      server.build.bind(server),
      'metro-bundle'
    )({
      ...bundleRequest,
      bundleType: 'bundle',
    });

    // Save the assets of the bundle
    const outputAssets = await getAssets(server, {
      ...bundleRequest,
      bundleType: 'todo',
    });

    return {
      bundle,
      assets: outputAssets,
    };
  } catch (error: any) {
    if (isError(error)) {
      // Log using Xcode error format so the errors are picked up by xcodebuild.
      // https://developer.apple.com/documentation/xcode/running-custom-scripts-during-a-build#Log-errors-and-warnings-from-your-script
      if (options.platform === 'ios') {
        // If the error is about to be presented in Xcode, strip the ansi characters from the message.
        if ('message' in error && isExecutingFromXcodebuild()) {
          error.message = stripAnsi(error.message) as string;
        }
        logMetroErrorInXcode(projectRoot, error);
      }
    }
    throw error;
  } finally {
    server.end();
  }
}

function isError(error: any): error is Error {
  return error instanceof Error;
}
