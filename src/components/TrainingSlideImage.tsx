import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View, type ImageLoadEventData, type NativeSyntheticEvent } from 'react-native';
import { fetchTrainingImage } from '../services/trainingApi';
import { colors } from '../theme/theme';

type Props = {
  url: string;
};

export function TrainingSlideImage({ url }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUri(null);
    setAspect(4 / 3);
    void fetchTrainingImage(url).then((next) => {
      if (cancelled) return;
      if (next) setUri(next);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const onLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const width = event.nativeEvent.source.width;
    const height = event.nativeEvent.source.height;
    if (width > 0 && height > 0) {
      setAspect(width / height);
    }
  };

  if (failed) return null;

  return (
    <View style={styles.frame}>
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="contain"
          onLoad={onLoad}
          style={[styles.image, { aspectRatio: aspect }]}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    marginBottom: 16,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E8EEF5',
  },
  image: {
    width: '100%',
  },
  loading: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
