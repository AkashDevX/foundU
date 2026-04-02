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

/**
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
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
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
