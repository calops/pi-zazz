{
  description = "Pi-zazz — fancy editor UI extension for pi-coding-agent";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];

      perSystem =
        { pkgs, ... }:
        let
          nodejs = pkgs.nodejs_22;
        in
        {
          devShells.default = pkgs.mkShell {
            name = "pi-zazz";
            packages = [
              nodejs
              pkgs.typescript
              pkgs.typescript-language-server
              pkgs.prettier
              pkgs.biome
              pkgs.ast-grep
            ];

            shellHook = ''
              echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
              echo "  pi-zazz devshell"
              echo "  Node $(node --version)"
              echo "  TypeScript $(tsc --version 2>/dev/null || echo 'not installed')"
              echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

              # Install project dependencies (including @types/node and peer deps)
              # so TypeScript can resolve type declarations. This is a no-op if
              # node_modules already exists and is up-to-date.
              if [ -f package-lock.json ]; then
                npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts 2>/dev/null || true
              else
                npm install --ignore-scripts 2>/dev/null || true
              fi

              # Add project-local binaries to PATH, but *after* the existing PATH
              # so globally installed tools (like the user's own pi) take precedence.
              export PATH="$PATH:$PWD/node_modules/.bin"
            '';
          };
        };
    };
}
