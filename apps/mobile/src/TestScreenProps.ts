/** Props every test screen takes when run as one step of a batch (see App.tsx). */
export interface TestScreenProps {
  batchId: string;
  /** Called once submission succeeds and the user is ready to move on. */
  onDone: () => void;
  /** "Next test" mid-batch, "Finish" on the last test. */
  nextLabel: string;
}
