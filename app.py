
# app.py

from flask import Flask, render_template, request, jsonify
import pandas as pd
import os

from ml_model import train_models, predict_transaction

app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB

# In-memory application data
dataset = None
trained_models = None
training_results = None
training_dataset = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CSV = os.path.join(BASE_DIR, "fraud_detection_demo.csv")


def load_default_dataset():
    global dataset

    if os.path.exists(DEFAULT_CSV):
        try:
            dataset = pd.read_csv(DEFAULT_CSV)
        except Exception:
            dataset = None


load_default_dataset()


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/status")
def status():
    return jsonify({
        "dataset_loaded": dataset is not None,
        "models_trained": trained_models is not None
    })


@app.route("/api/upload", methods=["POST"])
def upload_dataset():
    global dataset, trained_models, training_results, training_dataset

    if "file" not in request.files:
        return jsonify({"error": "No file was uploaded"}), 400

    file = request.files["file"]

    if not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Please upload a CSV file"}), 400

    try:
        uploaded_df = pd.read_csv(file)

        if uploaded_df.empty:
            return jsonify({"error": "The uploaded CSV is empty"}), 400

        if "isFraud" not in uploaded_df.columns:
            return jsonify({"error": "CSV must contain an isFraud column"}), 400

        dataset = uploaded_df

        # Clear old model results when new data is uploaded
        trained_models = None
        training_results = None
        training_dataset = None

        fraud_count = int(
            pd.to_numeric(dataset["isFraud"], errors="coerce").fillna(0).sum()
        )

        return jsonify({
            "message": "Dataset uploaded successfully",
            "rows": len(dataset),
            "columns": list(dataset.columns),
            "fraud_count": fraud_count,
            "normal_count": len(dataset) - fraud_count,
            "preview": dataset.head(10).fillna("").to_dict(orient="records")
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/dataset")
def dataset_info():
    if dataset is None:
        return jsonify({"error": "No dataset loaded"}), 400

    fraud_count = int(
        pd.to_numeric(dataset["isFraud"], errors="coerce").fillna(0).sum()
    )

    return jsonify({
        "rows": len(dataset),
        "columns": list(dataset.columns),
        "fraud_count": fraud_count,
        "normal_count": len(dataset) - fraud_count,
        "fraud_rate": round(fraud_count / max(len(dataset), 1) * 100, 4),
        "preview": dataset.head(10).fillna("").to_dict(orient="records")
    })


@app.route("/api/train", methods=["POST"])
def train():
    global trained_models, training_results, training_dataset

    if dataset is None:
        return jsonify({
            "error": "Please upload a CSV dataset first."
        }), 400

    try:
        output = train_models(dataset)

        trained_models = output["models"]
        training_results = output["results"]
        training_dataset = output["dataset"]

        return jsonify({
            "message": "Models trained successfully",
            "results": training_results,
            "rows_used": len(training_dataset),
            "fraud_count": int(training_dataset["isFraud"].sum()),
            "normal_count": int((training_dataset["isFraud"] == 0).sum())
        })

    except Exception as e:
        trained_models = None
        training_results = None
        training_dataset = None

        return jsonify({"error": str(e)}), 500


@app.route("/api/results")
def results():
    if training_results is None:
        return jsonify({"error": "Models have not been trained yet"}), 400

    return jsonify(training_results)


@app.route("/api/fraud-transactions")
def fraud_transactions():
    if training_dataset is None:
        return jsonify({"error": "Train models first"}), 400

    fraud_df = training_dataset[
        training_dataset["isFraud"] == 1
    ].copy()

    # Return latest/highest amount fraud records
    fraud_df = fraud_df.sort_values(
        "amount", ascending=False
    ).head(100)

    fraud_df = fraud_df.fillna("")

    return jsonify({
        "count": int(training_dataset["isFraud"].sum()),
        "transactions": fraud_df.to_dict(orient="records")
    })


@app.route("/api/predict", methods=["POST"])
def predict():
    if trained_models is None:
        return jsonify({
            "error": "Train the models before making predictions."
        }), 400

    try:
        data = request.get_json(force=True)

        output = predict_transaction(trained_models, data)

        return jsonify(output)

    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    app.run(debug=True, port=5000)
