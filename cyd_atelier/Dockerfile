FROM python:3.12-slim
ARG BUILD_VERSION=1.1.1
ARG BUILD_ARCH
LABEL io.hass.name="CYD Atelier" \
      io.hass.description="CYD-Display-Editor mit Live-Entitäten" \
      io.hass.type="app" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.arch="${BUILD_ARCH}"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./
COPY frontend/dist ./frontend/dist
EXPOSE 8099
CMD ["python", "server.py"]
