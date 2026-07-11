# Unreal reference slice

This content-only Unreal Engine 5.8 project is configured for the M1 Pro:

- Lumen software GI and reflections
- Temporal Super Resolution
- Metal SM6
- conventional shadow maps
- Nanite and hardware ray tracing disabled

After Unreal Engine 5.8 is installed, open `SausageFieldUE.uproject`, allow the enabled editor plugins to load, then execute `Content/Python/import_shared_assets.py` from Unreal's Python console. The script imports the shared FBX meshes and material maps and creates `/Game/Maps/SausageReference`.

The source meshes and texture contract live in `../../shared-assets/` and remain authoritative; Unreal `.uasset` files are engine-specific derivatives.
