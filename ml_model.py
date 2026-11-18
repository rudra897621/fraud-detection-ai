
# ml_model.py

import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    accuracy_score
)

from xgboost import XGBClassifier


FEATURES = [
    "amount",
    "frequency",
    "hour",
    "step",
    "type",
    "oldbalanceOrg",
    "newbalanceOrig"
]

TYPE_MAP = {
    "PAYMENT": 0,
    "CASH_IN": 1,
    "DEBIT": 2,
    "CASH_OUT": 3,
    "TRANSFER": 4
}


def prepare_data(df):
    df = df.copy()

    required = [
        "step", "type", "amount", "nameOrig",
        "oldbalanceOrg", "newbalanceOrig", "isFraud"
    ]

    missing = [col for col in required if col not in df.columns]

    if missing:
        raise ValueError(
            "Dataset missing required columns: " + ", ".join(missing)
        )

    # Clean data
    df["step"] = pd.to_numeric(df["step"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["oldbalanceOrg"] = pd.to_numeric(
        df["oldbalanceOrg"], errors="coerce"
    )
    df["newbalanceOrig"] = pd.to_numeric(
        df["newbalanceOrig"], errors="coerce"
    )
    df["isFraud"] = pd.to_numeric(df["isFraud"], errors="coerce")

    df = df.dropna(subset=required).copy()

    # Calculate transaction frequency using the original dataset
    df["frequency"] = df.groupby("nameOrig")["step"].transform("count")

    # Extract hour
    df["hour"] = df["step"] % 24

    # Encode transaction type
    df["type"] = df["type"].map(TYPE_MAP)

    df = df.dropna(subset=FEATURES + ["isFraud"])

    df["isFraud"] = df["isFraud"].astype(int)

    return df


def train_models(raw_df):
    df = prepare_data(raw_df)

    # Use all fraud rows and a sample of normal rows to reduce training time
    fraud = df[df["isFraud"] == 1]
    normal = df[df["isFraud"] == 0]

    normal_sample_size = min(300_000, len(normal))

    normal = normal.sample(
        n=normal_sample_size,
        random_state=42
    )

    df = pd.concat([fraud, normal], ignore_index=True)

    X = df[FEATURES]
    y = df["isFraud"]

    if y.nunique() < 2:
        raise ValueError("Dataset must contain both normal and fraud transactions.")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        stratify=y,
        random_state=42
    )

    ratio = max(
        1,
        (y_train == 0).sum() / max(1, (y_train == 1).sum())
    )

    models = {
        "Random Forest": RandomForestClassifier(
            n_estimators=100,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        ),
        "XGBoost": XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            scale_pos_weight=ratio,
            eval_metric="logloss",
            random_state=42,
            n_jobs=2
        )
    }

    results = {}
    trained_models = {}

    for name, model in models.items():

        model.fit(X_train, y_train)

        pred = model.predict(X_test)

        cm = confusion_matrix(
            y_test,
            pred,
            labels=[0, 1]
        )

        results[name] = {
            "accuracy": round(float(accuracy_score(y_test, pred)), 4),
            "precision": round(float(precision_score(
                y_test, pred, zero_division=0
            )), 4),
            "recall": round(float(recall_score(
                y_test, pred, zero_division=0
            )), 4),
            "f1": round(float(f1_score(
                y_test, pred, zero_division=0
            )), 4),
            "confusion_matrix": cm.tolist(),
            "feature_importance": {
                feature: round(float(value), 5)
                for feature, value in zip(
                    FEATURES,
                    model.feature_importances_
                )
            }
        }

        trained_models[name] = model

    return {
        "results": results,
        "models": trained_models,
        "dataset": df,
        "features": FEATURES
    }


def predict_transaction(models, transaction):
    """
    transaction should contain:
    amount, type, step, oldbalanceOrg, newbalanceOrig, frequency
    """

    tx_type = transaction.get("type", "TRANSFER")

    if isinstance(tx_type, str):
        tx_type = TYPE_MAP.get(tx_type.upper(), 4)

    step = float(transaction.get("step", 1))
    amount = float(transaction.get("amount", 0))
    old_balance = float(transaction.get("oldbalanceOrg", 0))
    new_balance = float(transaction.get("newbalanceOrig", 0))
    frequency = float(transaction.get("frequency", 1))

    row = pd.DataFrame([{
        "amount": amount,
        "frequency": frequency,
        "hour": step % 24,
        "step": step,
        "type": int(tx_type),
        "oldbalanceOrg": old_balance,
        "newbalanceOrig": new_balance
    }], columns=FEATURES)

    predictions = {}

    for name, model in models.items():
        prediction = int(model.predict(row)[0])
        probabilities = model.predict_proba(row)[0]

        predictions[name] = {
            "prediction": prediction,
            "label": "Fraud" if prediction == 1 else "Legitimate",
            "fraud_probability": round(float(probabilities[1]), 4)
        }

    return predictions
