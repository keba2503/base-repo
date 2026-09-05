export type FieldClassification = "none" | "personal" | "sensitive";

export type FieldClassifications<Fields> = Readonly<Record<keyof Fields, FieldClassification>>;

export function classify<Fields>(
  map: FieldClassifications<Fields>,
): FieldClassifications<Fields> {
  return Object.freeze({ ...map });
}

export function fieldsClassifiedAs<Fields>(
  classifications: FieldClassifications<Fields>,
  classification: FieldClassification,
): readonly string[] {
  return Object.keys(classifications).filter(
    (field) => classifications[field as keyof Fields] === classification,
  );
}
