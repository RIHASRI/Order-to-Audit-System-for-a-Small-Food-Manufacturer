import mongoose, { Schema, model } from 'mongoose';

interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter =
  mongoose.models.Counter || model<ICounter>('Counter', counterSchema);

/**
 * Generates an atomic sequential document number, optionally inside a Mongoose session.
 */
export async function getNextSequence(
  key: string,
  prefix: string,
  padLength = 4,
  session?: mongoose.ClientSession
): Promise<string> {
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  const num = String(doc.seq).padStart(padLength, '0');
  return `${prefix}${num}`;
}
