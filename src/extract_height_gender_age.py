import pandas as pd

# Paths assuming you run from project root: 316a4.github.io/
bmx_path = "raw-data/BMX_L.xpt"
demo_path = "raw-data/DEMO_L.xpt"

# Read XPT files
bmx = pd.read_sas(bmx_path, format="xport")
demo = pd.read_sas(demo_path, format="xport")

# Keep only needed columns
bmx_sub = bmx[["SEQN", "BMXHT"]]              # standing height (cm)
demo_sub = demo[["SEQN", "RIAGENDR", "RIDAGEYR"]]  # sex, age in years

# Merge on respondent ID
merged = pd.merge(bmx_sub, demo_sub, on="SEQN", how="inner")

# Keep valid standing height and age >= 2 (per documentation)
clean = merged[(merged["BMXHT"].notna()) & (merged["RIDAGEYR"] >= 2)]

# Make gender human-readable
clean["gender"] = clean["RIAGENDR"].map({1: "Male", 2: "Female"})

# Save to CSV (in raw-data folder at project root)
output_path = "raw-data/height_gender_age.csv"
clean.to_csv(output_path, index=False)

print(f"Saved {len(clean)} rows to {output_path}")