import type {
  ProgressionAlgorithm,
  ProgressionAlgorithmMeta,
} from "../domain/progression";

export interface AlgorithmRegistry {
  list(): Promise<ProgressionAlgorithmMeta[]>;
  get(id: string): Promise<ProgressionAlgorithm | null>;
}
