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
            packages = [
              nodejs
              pkgs.typescript
              pkgs.typescript-language-server
              pkgs.prettier
              pkgs.biome
            ];

            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
              echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
              echo "  pi-zazz devshell"
              echo "  Node $(node --version)"
              echo "  TypeScript $(tsc --version 2>/dev/null || echo 'not installed')"
              echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            '';
          };
        };
    };
}
