"""
Optional YOLOv8 inference service for ProctorGuard AI.

The browser app works without this (it uses MediaPipe EfficientDet-Lite0).
Run this only if you want YOLO detections, e.g. with a custom model that also
recognises loose paper / notes.

    pip install -r requirements.txt
    python server.py                       # serves on http://localhost:8000
    # then set VITE_YOLO_ENDPOINT=http://localhost:8000 in .env and restart `npm run dev`

API contract (matches src/modules/object-detection/ObjectDetectionService.ts):
    GET  /health -> {"ok": true, "model": "..."}
    POST /detect {"image": "data:image/jpeg;base64,..."}
         -> {"detections": [{"label": "cell phone", "confidence": 0.91, "box": [x, y, w, h]}]}
    Boxes are normalised to 0..1.
"""
import base64
import io
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from ultralytics import YOLO

MODEL_PATH = os.environ.get("YOLO_MODEL", "yolov8n.pt")  # COCO weights; swap for a custom model
ALLOWED = {"cell phone", "book", "person", "paper", "notes", "notebook"}

model = YOLO(MODEL_PATH)
app = FastAPI(title="ProctorGuard YOLO service")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])


class DetectRequest(BaseModel):
    image: str


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_PATH}


@app.post("/detect")
def detect(req: DetectRequest):
    data = req.image.split(",", 1)[-1]
    img = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
    w, h = img.size
    result = model.predict(img, conf=0.3, verbose=False)[0]
    detections = []
    for box in result.boxes:
        label = result.names[int(box.cls)]
        if label not in ALLOWED:
            continue
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        detections.append(
            {"label": label, "confidence": round(float(box.conf), 3), "box": [x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h]}
        )
    return {"detections": detections}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
