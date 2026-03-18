import pandas as pd
import json
from pathlib import Path


def age_to_bin(age):
    """Map age in years to the representative age bin."""
    if pd.isna(age):
        return None
    age = int(age)
    if age < 2:
        return None

    if age < 10:
        # yearly bins under 10
        return age
    if age < 20:
        # every 2 years between 10 and 20
        offset = round((age - 10) / 2)
        b = 10 + 2 * offset
        return max(10, min(20, b))

    # 20 and above: group by 10-year bands, use midpoint as label
    # e.g., 20–29 -> 25, 30–39 -> 35, ... up to 80–89 -> 85 (capped)
    decade_start = (age // 10) * 10
    if decade_start > 80:
        return None
    return decade_start + 5


def main():
    project_root = Path(__file__).resolve().parents[1]
    input_csv = project_root / "raw-data" / "height_gender_age.csv"
    output_dir = project_root / "docs" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(input_csv)

    # map age to bins
    df["age_bin"] = df["RIDAGEYR"].apply(age_to_bin)
    df = df[df["age_bin"].notna()].copy()

    # standardize columns
    df["age_bin"] = df["age_bin"].astype(int)
    df["gender"] = df["gender"].map({"Male": "Male", "Female": "Female"})

    # round height to nearest cm for cleaner visualization bins
    df["height_cm"] = df["BMXHT"].round(0).astype(int)

    # aggregate: counts and within-age-bin percentages by gender
    grouped = (
        df.groupby(["age_bin", "gender", "height_cm"])
        .size()
        .reset_index(name="count")
    )

    # compute percentages within each age_bin and gender
    # compute percentages within each age_bin and gender
    total_by_age_gender = (
        grouped.groupby(["age_bin", "gender"])["count"].transform("sum")
    )
    grouped["percent"] = grouped["count"] / total_by_age_gender

    # sort for nicer plotting
    grouped = grouped.sort_values(["age_bin", "gender", "height_cm"])

    records = grouped.to_dict(orient="records")

    # save a single JSON file that D3 can filter by gender and age_bin
    out_path = output_dir / "height_distributions_by_age_gender.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(records, f)

    print(f"Saved {len(records)} records to {out_path}")


if __name__ == "__main__":
    main()

