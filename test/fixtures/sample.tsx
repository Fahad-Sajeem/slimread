import { useCallback, memo } from "react";

export default function CallScreen({ id }: { id: string }) {
  const handleMessage = useCallback((text: string) => {
    console.log(text);
  }, []);

  const reset = () => {
    handleMessage("");
  };

  if (id) {
    const notASymbol = () => 1;
  }

  return <button onClick={reset}>{id}</button>;
}

export const Row = memo(function Row({ label }: { label: string }) {
  return <span>{label}</span>;
});
