import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  requireNativeComponent,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { safeTrainingHttpUrl, trainingMediaRequest, trainingVideoRequest } from '../services/trainingApi';
import { colors, fontFamily } from '../theme/theme';
import type { TrainingBlock } from '../types/training';

type NativeVideoProps = ViewProps & {
  source?: string;
  authorization?: string;
  company?: string;
  paused?: boolean;
  onPlaybackError?: () => void;
};

type NativeVideoComponent = React.ComponentType<NativeVideoProps>;

const nativeRegistry = globalThis as { __crulynkTrainingVideo?: NativeVideoComponent };

function nativeTrainingVideo(): NativeVideoComponent | null {
  if (Platform.OS !== 'android') return null;
  if (!nativeRegistry.__crulynkTrainingVideo) {
    nativeRegistry.__crulynkTrainingVideo = requireNativeComponent<NativeVideoProps>('TrainingVideoView');
  }
  return nativeRegistry.__crulynkTrainingVideo;
}

type Props = {
  block?: TrainingBlock;
  mediaUrl?: string;
  label?: string;
};

export function TrainingVideoPlayer({ block, mediaUrl, label }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [authorization, setAuthorization] = useState('');
  const [company, setCompany] = useState('');
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = label || block?.label || 'Play video';

  const onPlay = async () => {
    if (busy) return;
    setError(null);
    if (mediaUrl) {
      setBusy(true);
      const ready = await trainingMediaRequest(mediaUrl);
      setBusy(false);
      if (!ready.ok) {
        setError(ready.message);
        return;
      }
      setAuthorization(ready.authorization);
      setCompany(ready.company);
      setPaused(false);
      setUrl(ready.url);
      return;
    }
    const direct = block && !block.has_file ? safeTrainingHttpUrl(block.body) : null;
    if (direct) {
      setAuthorization('');
      setCompany('');
      setPaused(false);
      setUrl(direct);
      return;
    }
    if (!block?.has_file) {
      setError('This item does not have a file yet.');
      return;
    }
    setBusy(true);
    const ready = await trainingVideoRequest(block.id);
    setBusy(false);
    if (!ready.ok) {
      setError(ready.message);
      return;
    }
    setAuthorization(ready.authorization);
    setCompany(ready.company);
    setPaused(false);
    setUrl(ready.url);
  };

  const NativeVideo = nativeTrainingVideo();

  return (
    <View>
      {url && NativeVideo ? (
        <View style={styles.player}>
          <NativeVideo
            source={url}
            authorization={authorization}
            company={company}
            paused={paused}
            onPlaybackError={() => {
              setUrl(null);
              setError('Could not play this video.');
            }}
            style={styles.video}
          />
          <View style={styles.bar}>
            <Pressable onPress={() => setPaused((value) => !value)} hitSlop={8} accessibilityRole="button">
              <Feather name={paused ? 'play' : 'pause'} size={18} color={colors.white} />
            </Pressable>
            <Text style={styles.barTitle} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              onPress={() => {
                setUrl(null);
                setPaused(false);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close video"
            >
              <Feather name="x" size={18} color={colors.white} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => void onPlay()} style={styles.row} accessibilityRole="button">
          <Feather name="play-circle" size={18} color={colors.primary} />
          <Text style={styles.title}>{title}</Text>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Feather name="play" size={16} color={colors.text.secondary} />}
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
  },
  player: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
    aspectRatio: 16 / 9,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 29, 61, 0.72)',
  },
  barTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  error: {
    marginTop: 6,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#B91C1C',
  },
});
