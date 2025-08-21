FROM ubuntu:latest

WORKDIR /workspace

RUN apt-get update && apt-get install -y curl jq build-essential

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh && . "$HOME/.cargo/env"

RUN source ./.github/.env

RUN rustup install $RUST_VERSION && rustup default $RUST_VERSION

RUN sh -c "$(curl -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install)" && export PATH="/root/.local/share/solana/install/active_release/bin:$PATH"

RUN cd ./configs/scripts/program && ./build.sh
