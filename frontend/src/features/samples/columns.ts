export const sampleColumns = [
  { key: "sample_id", label: "Sample ID" },
  { key: "date_sampled", label: "Date Sampled" },
  { key: "date_received", label: "Date Received" },
  { key: "machine", label: "Machine" },
  { key: "component", label: "Component" },
  { key: "serial_number", label: "Serial Number" },
  { key: "reference_lube", label: "Refrence Lube" },
] as const;

export const labelMappings = {
  large: ["Barcode or printed number", "Date", "Batch receiving date", "Equip ID", "Sample point", "Leave blank", "Ref Lube"],
  small: ["Barcode or printed number", "Date", "Batch receiving date", "RN", "Circled number + circled GS/NGS", "SN", "Leave blank"],
};
