FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .

# Hosted (streamable-HTTP) by default so Claude can reach it over the network.
ENV MCP_TRANSPORT=http \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=9100

EXPOSE 9100
CMD ["python", "server.py"]
