import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_DIMENSION,
  SUBMISSION_COMMENT_MAX_LENGTH,
  THUMBNAIL_JPEG_QUALITY,
  THUMBNAIL_MAX_DIMENSION,
} from '@construct/shared';
import { useAuthStore } from '../store/useAuthStore';
import { useSubmissionsStore } from '../store/useSubmissionsStore';
import { useProjectRole } from '../hooks/useProjectRole';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, Field, colors } from './ui';

interface PickedPhoto {
  photoUri: string;
  thumbnailUri: string;
}

/** Compress to the agreed targets (1600px long edge / JPEG 0.7) + thumbnail. */
async function compressPicked(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  const landscape = (asset.width ?? 1) >= (asset.height ?? 1);
  const resizeTo = (max: number) =>
    landscape
      ? { width: Math.min(asset.width ?? max, max) }
      : { height: Math.min(asset.height ?? max, max) };

  const photo = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: resizeTo(PHOTO_MAX_DIMENSION) }],
    { compress: PHOTO_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  const thumbnail = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: resizeTo(THUMBNAIL_MAX_DIMENSION) }],
    { compress: THUMBNAIL_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { photoUri: photo.uri, thumbnailUri: thumbnail.uri };
}

export function SubmissionsFeed({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const me = useAuthStore((s) => s.user);
  const submissions = useSubmissionsStore((s) => s.submissionsByTask[taskId]) ?? [];
  const pending = useSubmissionsStore((s) => s.pendingByTask[taskId]) ?? [];
  const uploadProgress = useSubmissionsStore((s) => s.uploadProgress);
  const fetchSubmissions = useSubmissionsStore((s) => s.fetchSubmissions);
  const addSubmission = useSubmissionsStore((s) => s.addSubmission);
  const deleteSubmission = useSubmissionsStore((s) => s.deleteSubmission);

  const myRole = useProjectRole(projectId);
  const isManager = myRole === 'owner' || myRole === 'superuser';

  const [comment, setComment] = useState('');
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions(projectId, taskId).catch((err) => setError(apiErrorMessage(err)));
  }, [projectId, taskId, fetchSubmissions]);

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Camera permission is required to take a photo.');
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      setPicked(await compressPicked(result.assets[0]));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // Queued locally first — visible as "pending" immediately, synced in
      // the background if we're offline.
      await addSubmission(projectId, taskId, {
        comment: comment.trim() || null,
        photoUri: picked?.photoUri ?? null,
        thumbnailUri: picked?.thumbnailUri ?? null,
      });
      setComment('');
      setPicked(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (submissionId: string) => {
    Alert.alert('Delete submission', 'Remove this submission from the feed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteSubmission(projectId, taskId, submissionId).catch((err) =>
            setError(apiErrorMessage(err)),
          );
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Submissions</Text>
      <ErrorText>{error}</ErrorText>

      <View style={styles.composer}>
        <View style={styles.pickRow}>
          <View style={styles.pickButton}>
            <Button title="Camera" variant="secondary" onPress={() => void pick('camera')} />
          </View>
          <View style={styles.pickButton}>
            <Button title="Gallery" variant="secondary" onPress={() => void pick('library')} />
          </View>
        </View>
        {picked ? (
          <View style={styles.previewRow}>
            <Image source={{ uri: picked.thumbnailUri }} style={styles.preview} />
            <Text style={styles.removePhoto} onPress={() => setPicked(null)}>
              Remove photo
            </Text>
          </View>
        ) : null}
        <Field
          label="Comment"
          value={comment}
          onChangeText={setComment}
          placeholder="What happened on site?"
          multiline
          maxLength={SUBMISSION_COMMENT_MAX_LENGTH}
        />
        <Button
          title="Add submission"
          onPress={() => void submit()}
          loading={submitting}
          disabled={!picked && !comment.trim()}
        />
      </View>

      {pending.map((item) => (
        <View key={item.id} style={[styles.item, styles.pendingItem]}>
          {item.localThumbnailUri ? (
            <Image source={{ uri: item.localThumbnailUri }} style={styles.photo} />
          ) : null}
          {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : null}
          <Text style={styles.pendingLabel}>
            ⏳ Pending upload
            {uploadProgress[item.id] !== undefined && uploadProgress[item.id] < 1
              ? ` — ${Math.round(uploadProgress[item.id] * 100)}%`
              : ' — will sync when back online'}
          </Text>
        </View>
      ))}

      {submissions.map((submission) => {
        const canDelete = isManager || submission.userId === me?.id;
        return (
          <View key={submission.id} style={styles.item}>
            {submission.thumbnailUrl || submission.photoUrl ? (
              <Image
                source={{ uri: submission.thumbnailUrl ?? submission.photoUrl ?? undefined }}
                style={styles.photo}
                resizeMode="cover"
              />
            ) : null}
            {submission.comment ? (
              <Text style={styles.comment}>{submission.comment}</Text>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {submission.user.name} · {new Date(submission.createdAt).toLocaleString()}
              </Text>
              {canDelete ? (
                <TouchableOpacity onPress={() => confirmDelete(submission.id)}>
                  <Text style={styles.delete}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}

      {submissions.length === 0 && pending.length === 0 ? (
        <Text style={styles.empty}>No submissions yet — add the first photo or note.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 24 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  composer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  pickRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  pickButton: { flex: 1 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  preview: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.badge },
  removePhoto: { color: colors.danger, fontWeight: '600' },
  item: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  pendingItem: { borderStyle: 'dashed', opacity: 0.85 },
  pendingLabel: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 6 },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: colors.badge,
    marginBottom: 8,
  },
  comment: { color: colors.text, fontSize: 14, lineHeight: 20 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  meta: { color: colors.muted, fontSize: 12 },
  delete: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  empty: { color: colors.muted, textAlign: 'center', marginVertical: 16 },
});
