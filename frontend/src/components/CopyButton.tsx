import React from "react";
import { Button } from "@chakra-ui/react";

type CopyButtonProps = {
  value: string;
  onCopy?: () => void;
  "aria-label"?: string; // for accessibility, optional
};

const CopyButton: React.FC<CopyButtonProps> = ({ value, onCopy, ...rest }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      if (onCopy) onCopy();
    } catch (err) {
      // Optionally handle copy error, e.g., show a toast if desired
    }
  };

  return (
    <Button onClick={handleCopy} size="xs" ml={2} {...rest}>
      Copy
    </Button>
  );
};

export default CopyButton;
