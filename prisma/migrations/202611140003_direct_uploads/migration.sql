-- Additive state used to claim finalization without holding a DB transaction over network IO.
-- No existing rows or file paths are changed.
ALTER TYPE "DocumentStatus" ADD VALUE 'VERIFYING';
