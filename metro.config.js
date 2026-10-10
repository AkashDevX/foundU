const fs = require('fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro sometimes fails to resolve `@react-native-community/datetimepicker`'s
 * package.json `main` (`./src/index.js`) on Windows (symlinks, path casing, or
 * incomplete installs) even though the file is present. Pin the entry to the
 * same absolute path Node resolves.
 */
function resolveDatetimePickerEntry() {
  try {
    const resolved = require.resolve('@react-native-community/datetimepicker/src/index.js', {
      paths: [__dirname],
    });
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  } catch {
    return null;
  }
}

const datetimePickerEntry = resolveDatetimePickerEntry();

// Gradle rebuilds under android/.gradle; watching those paths crashes Metro on Windows
// when a folder disappears mid-watch (ENOENT on build-attribution, etc.).
const androidBuildBlockList =
  /[/\\]android[/\\](?:\.gradle|build|app[/\\](?:build|\.cxx)|\$buildDir)[/\\].*/;

/**
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    blockList: androidBuildBlockList,
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@react-native-community/datetimepicker' && datetimePickerEntry) {
        return {
          type: 'sourceFile',
          filePath: datetimePickerEntry,
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
  server: {
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Android's OkHttp client fails while reading Metro's chunked
        // multipart/mixed bundle (ProtocolException: leading byte 0x0d).
        // A normal application/javascript body with Content-Length loads.
        const accept = req.headers.accept;
        if (typeof accept === 'string' && accept.includes('multipart/mixed')) {
          const nextAccept = accept
            .split(',')
            .map(part => part.trim())
            .filter(part => part && part !== 'multipart/mixed')
            .join(', ');
          if (nextAccept) {
            req.headers.accept = nextAccept;
          } else {
            delete req.headers.accept;
          }
        }
        return middleware(req, res, next);
      };
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
