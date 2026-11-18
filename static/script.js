
/* static/script.js */

let performanceChart = null;
let distributionChart = null;
let modelChart = null;

let currentResults = null;

// ---------------- HELPERS ----------------

const $ = (id) => document.getElementById(id);

function fmtNumber(value) {
    return Number(value || 0).toLocaleString("en-IN");
}

function fmtMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}

function pct(value) {
    return (Number(value || 0) * 100).toFixed(2) + "%";
}

async function api(url, options = {}) {
    const response = await fetch(url, options);

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("Server returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }

    return data;
}

function setMessage(id, text, type = "") {
    const el = $(id);
    el.textContent = text;
    el.className = "message " + type;
}

function safe(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

// ---------------- NAVIGATION ----------------

const pageTitles = {
    dashboard: "Dashboard Overview",
    dataset: "Dataset Explorer",
    models: "Model Performance",
    fraud: "Fraud Transactions",
    predict: "Test Transaction"
};

function navigate(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

    $(page).classList.add("active");

    const nav = document.querySelector(`[data-page="${page}"]`);
    if (nav) nav.classList.add("active");

    $("page-title").textContent = pageTitles[page] || "Dashboard";

    if (page === "fraud") loadFraudTransactions();
}

document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        navigate(button.dataset.page);
    });
});

// ---------------- CHARTS ----------------

function initCharts() {
    Chart.defaults.color = "#8392a9";
    Chart.defaults.font.family = "Inter";
    Chart.defaults.borderColor = "#1e2b3e";

    performanceChart = new Chart($("performanceChart"), {
        type: "bar",
        data: {
            labels: ["Precision", "Recall"],
            datasets: [
                {
                    label: "Random Forest",
                    data: [0, 0],
                    backgroundColor: "#35c8e8",
                    borderRadius: 5
                },
                {
                    label: "XGBoost",
                    data: [0, 0],
                    backgroundColor: "#31d0a0",
                    borderRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, padding: 18 }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 1,
                    ticks: {
                        callback: (value) => (value * 100) + "%"
                    },
                    grid: { color: "#1e2b3e" }
                },
                x: { grid: { display: false } }
            }
        }
    });

    distributionChart = new Chart($("distributionChart"), {
        type: "doughnut",
        data: {
            labels: ["Normal", "Fraud"],
            datasets: [{
                data: [1, 0],
                backgroundColor: ["#35c8e8", "#ff6478"],
                borderColor: "#101929",
                borderWidth: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "72%",
            plugins: {
                legend: { display: false }
            }
        }
    });

    modelChart = new Chart($("modelChart"), {
        type: "bar",
        data: {
            labels: ["Precision", "Recall", "F1 Score"],
            datasets: [
                {
                    label: "Random Forest",
                    data: [0, 0, 0],
                    backgroundColor: "#35c8e8",
                    borderRadius: 5
                },
                {
                    label: "XGBoost",
                    data: [0, 0, 0],
                    backgroundColor: "#31d0a0",
                    borderRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, padding: 20 }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 1,
                    ticks: {
                        callback: (value) => (value * 100) + "%"
                    },
                    grid: { color: "#1e2b3e" }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function updateDistribution(normal, fraud) {
    distributionChart.data.datasets[0].data = [normal, fraud];
    distributionChart.update();
}

// ---------------- DATASET ----------------

function updateDatasetStats(data) {
    $("total-transactions").textContent = fmtNumber(data.rows);
    $("fraud-count").textContent = fmtNumber(data.fraud_count);
    $("fraud-rate").textContent =
        ((data.fraud_count / Math.max(data.rows, 1)) * 100).toFixed(3) + "%";

    $("dataset-rows").textContent = fmtNumber(data.rows);
    $("dataset-normal").textContent = fmtNumber(data.normal_count);
    $("dataset-fraud").textContent = fmtNumber(data.fraud_count);
    $("dataset-columns").textContent = fmtNumber(data.columns.length);

    updateDistribution(data.normal_count, data.fraud_count);
}

function renderDatasetPreview(data) {
    const columns = data.columns || [];
    const rows = data.preview || [];

    $("dataset-head").innerHTML = `
        <tr>${columns.map(c => `<th>${safe(c)}</th>`).join("")}</tr>
    `;

    $("dataset-body").innerHTML = rows.map(row => `
        <tr>
            ${columns.map(col => `<td>${safe(row[col])}</td>`).join("")}
        </tr>
    `).join("");
}

async function loadDatasetInfo() {
    try {
        const data = await api("/api/dataset");
        updateDatasetStats(data);
        renderDatasetPreview(data);
    } catch (err) {
        console.log("No dataset loaded:", err.message);
    }
}

// ---------------- UPLOAD ----------------

const fileInput = $("csv-input");
const dropZone = $("drop-zone");

fileInput.addEventListener("change", () => {
    if (fileInput.files.length) {
        uploadFile(fileInput.files[0]);
    }
});

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");

    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
});

async function uploadFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
        setMessage("upload-status", "Please select a CSV file.", "error");
        return;
    }

    setMessage("upload-status", "Uploading and reading dataset...");

    const formData = new FormData();
    formData.append("file", file);

    try {
        const data = await api("/api/upload", {
            method: "POST",
            body: formData
        });

        setMessage(
            "upload-status",
            `Successfully uploaded ${file.name} (${fmtNumber(data.rows)} rows).`,
            "success"
        );

        await loadDatasetInfo();
        navigate("dataset");

    } catch (err) {
        setMessage("upload-status", err.message, "error");
    }
}

// ---------------- TRAIN MODELS ----------------

async function trainModels() {
    const buttons = document.querySelectorAll(
        'button[onclick="trainModels()"]'
    );

    buttons.forEach(btn => {
        btn.disabled = true;
        btn.dataset.original = btn.textContent;
        btn.textContent = "Training...";
    });

    setMessage(
        "training-status",
        "Training Random Forest and XGBoost. Please wait..."
    );

    $("model-status").textContent = "Training in progress...";

    try {
        const data = await api("/api/train", { method: "POST" });

        currentResults = data.results;

        renderModelResults(data.results);

        $("models-count").textContent = "2 / 2";
        $("model-status").textContent = "Training completed";

        setMessage(
            "training-status",
            `Training completed successfully on ${fmtNumber(data.rows_used)} records.`,
            "success"
        );

        await loadFraudTransactions();
        navigate("models");

    } catch (err) {
        setMessage("training-status", err.message, "error");
        $("model-status").textContent = "Training failed";
    } finally {
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.textContent = btn.dataset.original || "Train Models";
        });
    }
}

function renderModelResults(results) {
    const rf = results["Random Forest"];
    const xgb = results["XGBoost"];

    if (!rf || !xgb) return;

    $("rf-precision").textContent = pct(rf.precision);
    $("rf-recall").textContent = pct(rf.recall);
    $("xgb-precision").textContent = pct(xgb.precision);
    $("xgb-recall").textContent = pct(xgb.recall);

    performanceChart.data.datasets[0].data = [
        rf.precision, rf.recall
    ];
    performanceChart.data.datasets[1].data = [
        xgb.precision, xgb.recall
    ];
    performanceChart.update();

    modelChart.data.datasets[0].data = [
        rf.precision, rf.recall, rf.f1
    ];
    modelChart.data.datasets[1].data = [
        xgb.precision, xgb.recall, xgb.f1
    ];
    modelChart.update();

    renderMatrix("rf-matrix", rf.confusion_matrix);
    renderMatrix("xgb-matrix", xgb.confusion_matrix);
}

function renderMatrix(id, cm) {
    if (!cm || cm.length !== 2) return;

    $(""+id).innerHTML = `
        <div class="matrix">
            <div class="matrix-label"></div>
            <div class="matrix-label">Predicted Normal</div>
            <div class="matrix-label">Predicted Fraud</div>

            <div class="matrix-label">Actual Normal</div>
            <div class="tn"><strong>${fmtNumber(cm[0][0])}</strong>TN</div>
            <div class="fp"><strong>${fmtNumber(cm[0][1])}</strong>FP</div>

            <div class="matrix-label">Actual Fraud</div>
            <div class="fn"><strong>${fmtNumber(cm[1][0])}</strong>FN</div>
            <div class="tp"><strong>${fmtNumber(cm[1][1])}</strong>TP</div>
        </div>
    `;
}

// ---------------- FRAUD TABLE ----------------

async function loadFraudTransactions() {
    try {
        const data = await api("/api/fraud-transactions");

        $("fraud-table-count").textContent =
            `${fmtNumber(data.count)} fraud records identified in dataset (showing up to 100).`;

        const rows = data.transactions || [];

        $("fraud-table-body").innerHTML = rows.map(row => `
            <tr>
                <td>${safe(row.type)}</td>
                <td class="amount">${fmtMoney(row.amount)}</td>
                <td>${safe(row.step)}</td>
                <td>${fmtMoney(row.oldbalanceOrg)}</td>
                <td>${fmtMoney(row.newbalanceOrig)}</td>
                <td><span class="fraud-badge">FRAUD</span></td>
            </tr>
        `).join("") || `<tr><td colspan="6" class="empty">No fraud records.</td></tr>`;

        $("recent-fraud-body").innerHTML = rows.slice(0, 5).map(row => `
            <tr>
                <td>${safe(row.type)}</td>
                <td class="amount">${fmtMoney(row.amount)}</td>
                <td>${safe(row.step)}</td>
                <td>${fmtMoney(row.oldbalanceOrg)}</td>
                <td><span class="fraud-badge">FRAUD</span></td>
            </tr>
        `).join("");

    } catch (err) {
        $("fraud-table-body").innerHTML =
            `<tr><td colspan="6" class="empty">${safe(err.message)}</td></tr>`;
    }
}

// ---------------- PREDICTION ----------------

$("predict-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    payload.amount = Number(payload.amount);
    payload.step = Number(payload.step);
    payload.frequency = Number(payload.frequency);
    payload.oldbalanceOrg = Number(payload.oldbalanceOrg);
    payload.newbalanceOrig = Number(payload.newbalanceOrig);

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Analyzing...";

    $("prediction-results").innerHTML = `
        <div class="prediction-placeholder">
            <h3>Analyzing transaction...</h3>
            <p>Running both machine learning models.</p>
        </div>
    `;

    try {
        const data = await api("/api/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        renderPrediction(data);

    } catch (err) {
        $("prediction-results").innerHTML = `
            <div class="prediction-placeholder">
                <h3>Prediction failed</h3>
                <p>${safe(err.message)}</p>
            </div>
        `;
    } finally {
        btn.disabled = false;
        btn.textContent = "Analyze Transaction →";
    }
});

function renderPrediction(data) {
    const entries = Object.entries(data);

    $("prediction-results").innerHTML = `
        <div class="prediction-results">
            ${entries.map(([name, result]) => {
                const fraud = result.prediction === 1;

                return `
                    <div class="result-card ${fraud ? "fraud" : "legitimate"}">
                        <h4>${safe(name)}</h4>
                        <div class="result-status ${fraud ? "fraud" : "legitimate"}">
                            ${fraud ? "⚠ FRAUD DETECTED" : "✓ LEGITIMATE"}
                        </div>
                        <p>Fraud probability: ${pct(result.fraud_probability)}</p>
                        <p>Prediction: ${result.prediction}</p>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

// ---------------- START ----------------

initCharts();
loadDatasetInfo();
