import React, { useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { createAccountScreenStyles } from '../styles/styles';
import { colors, fontFamily, spacing } from '../theme/theme';

export type PenPoint = { x: number; y: number };
export type SignatureDrawing = { width: number; height: number; strokes: PenPoint[][] };

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  const styles = createAccountScreenStyles;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={[styles.fieldHint, { marginBottom: 0 }]}>{hint}</Text> : null}
    </View>
  );
}

export function SignatureInk({ strokes }: { strokes: PenPoint[][] }) {
  const ink: React.ReactNode[] = [];
  strokes.forEach((stroke, strokeIndex) => {
    stroke.forEach((point, index) => {
      const next = stroke[index + 1];
      if (!next) {
        ink.push(
          <View
            key={`${strokeIndex}-dot-${index}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: point.x - 4,
              top: point.y - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#111827',
            }}
          />,
        );
        return;
      }
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.4) return;
      ink.push(
        <View
          key={`${strokeIndex}-line-${index}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (point.x + next.x) / 2 - length / 2,
            top: (point.y + next.y) / 2 - 2,
            width: length,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#111827',
            transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
          }}
        />,
      );
    });
  });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {ink}
    </View>
  );
}

export function SignaturePad({
  drawingRef,
  scrollRef,
}: {
  drawingRef: React.MutableRefObject<SignatureDrawing | null>;
  scrollRef: React.RefObject<ScrollView | null>;
}) {
  const sizeRef = useRef({ width: 320, height: 160 });
  const strokesRef = useRef<PenPoint[][]>(drawingRef.current?.strokes ?? []);
  const [strokes, setStrokes] = useState<PenPoint[][]>(strokesRef.current);
  const paintFrame = useRef<number | null>(null);

  const save = (next: PenPoint[][]) => {
    strokesRef.current = next;
    drawingRef.current = {
      width: Math.max(1, Math.round(sizeRef.current.width)),
      height: Math.max(1, Math.round(sizeRef.current.height)),
      strokes: next,
    };
  };

  const paint = (immediate = false) => {
    const apply = () => {
      paintFrame.current = null;
      setStrokes(strokesRef.current.map((stroke) => stroke.slice()));
    };
    if (immediate) {
      if (paintFrame.current != null) cancelAnimationFrame(paintFrame.current);
      apply();
      return;
    }
    if (paintFrame.current != null) return;
    paintFrame.current = requestAnimationFrame(apply);
  };

  const clampPoint = (x: number, y: number): PenPoint | null => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: Math.max(0, Math.min(sizeRef.current.width, x)),
      y: Math.max(0, Math.min(sizeRef.current.height, y)),
    };
  };

  const addPoint = (x: number, y: number, isNewStroke: boolean) => {
    const point = clampPoint(x, y);
    if (!point) return;
    const current = strokesRef.current;
    if (isNewStroke || current.length === 0) {
      save([...current, [point]]);
      paint();
      return;
    }
    const stroke = current[current.length - 1];
    const previous = stroke[stroke.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1.2) return;
    const next = current.slice();
    next[next.length - 1] = [...stroke, point];
    save(next);
    paint();
  };

  const lockScroll = (enabled: boolean) => {
    scrollRef.current?.setNativeProps({ scrollEnabled: enabled });
  };

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <FieldLabel label="Signature *" hint="Draw your signature in the box. The page stays still while you sign." />
      <View
        collapsable={false}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0) sizeRef.current = { width, height };
        }}
        onTouchStart={() => lockScroll(false)}
        onTouchEnd={() => lockScroll(true)}
        onTouchCancel={() => lockScroll(true)}
        onStartShouldSetResponder={() => true}
        onStartShouldSetResponderCapture={() => true}
        onMoveShouldSetResponder={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          lockScroll(false);
          addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, true);
        }}
        onResponderMove={(event) => {
          addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, false);
        }}
        onResponderRelease={() => {
          lockScroll(true);
          paint(true);
        }}
        onResponderTerminate={() => {
          lockScroll(true);
          paint(true);
        }}
        style={{
          height: 160,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#111827',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
        }}
      >
        <SignatureInk strokes={strokes} />
        <Text
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            fontFamily: fontFamily.regular,
            color: '#9CA3AF',
            opacity: strokes.length === 0 ? 1 : 0,
          }}
        >
          Sign here
        </Text>
      </View>
      {strokes.length > 0 ? (
        <TouchableOpacity
          onPress={() => {
            save([]);
            paint();
          }}
        >
          <Text style={{ marginTop: 8, fontFamily: fontFamily.semiBold, color: colors.accent }}>Clear signature</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ height: 28 }} />
      )}
    </View>
  );
}

export function SignaturePreview({
  drawing,
  plain = false,
}: {
  drawing: SignatureDrawing;
  plain?: boolean;
}) {
  const height = plain ? 96 : 160;
  const [width, setWidth] = useState(0);
  const scaleX = width > 0 && drawing.width > 0 ? width / drawing.width : 1;
  const scaleY = drawing.height > 0 ? height / drawing.height : 1;
  const strokes = drawing.strokes.map((stroke) =>
    stroke.map((point) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
    })),
  );

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={
        plain
          ? {
              width: '100%',
              height,
              backgroundColor: 'transparent',
              overflow: 'hidden',
            }
          : {
              height,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#111827',
              backgroundColor: '#FFFFFF',
              overflow: 'hidden',
            }
      }
    >
      <SignatureInk strokes={strokes} />
    </View>
  );
}
