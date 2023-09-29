FROM node:20

RUN apt update && apt install git curl python3
RUN git clone https://github.com/emscripten-core/emsdk.git /emscripten --branch 3.1.29
WORKDIR /emscripten
RUN ./emsdk install 1.40.1-fastcomp
RUN ./emsdk activate 1.40.1-fastcomp
RUN echo "source /emscripten/emsdk_env.sh" >> /root/.bashrc
ENV echo "export EMSDK_PATH=/emscripten" >> /root/.bashrc
ENV echo "export EMSCRIPTEN_BIN=/emscripten/fastcomp/emscripten/emcc" >> /root/.bashrc

WORKDIR /root
RUN curl -L https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-12/wasi-sdk-12.0-linux.tar.gz -o wasi.tar.gz
RUN tar -xvf wasi.tar.gz && mv wasi-sdk-12.0 /wasi
ENV echo "export WASI_PATH=/wasi" >> /root/.bashrc

RUN npm i -g chomp

