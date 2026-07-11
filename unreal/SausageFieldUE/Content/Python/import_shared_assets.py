"""Import shared Blender exports and establish the Unreal reference level.

Run from Unreal Editor's Python console:
  exec(open('<workspace>/unreal/SausageFieldUE/Content/Python/import_shared_assets.py').read())
"""

from pathlib import Path

import unreal


WORKSPACE = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())).parents[1]
MODEL_DIR = WORKSPACE / "shared-assets" / "models"
TEXTURE_DIR = WORKSPACE / "shared-assets" / "textures"


def build_hero_material():
    asset_path = "/Game/SausageField/Materials/M_HeroCasing"
    material = unreal.load_asset(asset_path)
    if material is None:
        material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            "M_HeroCasing",
            "/Game/SausageField/Materials",
            unreal.Material,
            unreal.MaterialFactoryNew(),
        )
    unreal.MaterialEditingLibrary.delete_all_material_expressions(material)

    base = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionTextureSample, -520, -80
    )
    base.texture = unreal.load_asset("/Game/SausageField/Textures/hero-basecolor")
    unreal.MaterialEditingLibrary.connect_material_property(
        base, "RGB", unreal.MaterialProperty.MP_BASE_COLOR
    )

    normal = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionTextureSample, -520, 180
    )
    normal.texture = unreal.load_asset("/Game/SausageField/Textures/hero-normal")
    normal.sampler_type = unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL
    unreal.MaterialEditingLibrary.connect_material_property(
        normal, "RGB", unreal.MaterialProperty.MP_NORMAL
    )

    roughness = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, -260, 80
    )
    roughness.r = 0.34
    unreal.MaterialEditingLibrary.connect_material_property(
        roughness, "", unreal.MaterialProperty.MP_ROUGHNESS
    )
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
    return material


def import_texture(path: Path) -> None:
    task = unreal.AssetImportTask()
    task.filename = str(path)
    task.destination_path = "/Game/SausageField/Textures"
    task.automated = True
    task.replace_existing = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])


def import_skeletal_mesh(path: Path) -> None:
    options = unreal.FbxImportUI()
    options.import_mesh = True
    options.import_as_skeletal = True
    options.import_animations = False
    options.import_materials = False
    options.import_textures = False
    options.skeletal_mesh_import_data.import_mesh_lods = True
    options.skeletal_mesh_import_data.normal_import_method = unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS_AND_TANGENTS
    task = unreal.AssetImportTask()
    task.filename = str(path)
    task.destination_path = "/Game/SausageField/Meshes"
    task.automated = True
    task.replace_existing = True
    task.save = True
    task.options = options
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])


def build_level() -> None:
    level_path = "/Game/Maps/SausageReference"
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    level_subsystem.new_level(level_path)
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    for existing_actor in actor_subsystem.get_all_level_actors():
        actor_subsystem.destroy_actor(existing_actor)
    hero_material = build_hero_material()
    directional = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(-500, -350, 850))
    directional.set_actor_rotation(unreal.Rotator(-28, -42, 0), False)
    directional.set_actor_label("Late Afternoon Sun")
    sun_component = directional.get_component_by_class(unreal.DirectionalLightComponent)
    sun_component.set_mobility(unreal.ComponentMobility.MOVABLE)
    sun_component.set_editor_property("atmosphere_sun_light", True)
    sky = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 400))
    sky.set_actor_label("Humid Sky Fill")
    sky.get_component_by_class(unreal.SkyLightComponent).set_mobility(unreal.ComponentMobility.MOVABLE)
    atmosphere = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.SkyAtmosphere, unreal.Vector(0, 0, 0)
    )
    atmosphere.set_actor_label("Physical Sky")
    fog = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0))
    fog.set_actor_label("Field Atmosphere")

    ground_mesh = unreal.load_asset("/Engine/BasicShapes/Plane.Plane")
    ground = unreal.EditorLevelLibrary.spawn_actor_from_object(ground_mesh, unreal.Vector(0, 0, 0))
    ground.set_actor_label("Reference Ground")
    ground.set_actor_scale3d(unreal.Vector(12, 12, 12))

    hero_positions = (
        ("high", unreal.Vector(0, 0, 0)),
        ("mid", unreal.Vector(-220, 260, 0)),
        ("low", unreal.Vector(240, 330, 0)),
    )
    for slug, location in hero_positions:
        mesh = unreal.load_asset(f"/Game/SausageField/Meshes/sausage-hero-{slug}")
        hero = unreal.EditorLevelLibrary.spawn_actor_from_object(mesh, location)
        hero.set_actor_label(f"Sausage Hero {slug.title()}")
        hero.get_component_by_class(unreal.SkeletalMeshComponent).set_material(0, hero_material)

    camera = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.CineCameraActor, unreal.Vector(520, -720, 310)
    )
    camera.set_actor_label("Reference Camera")
    camera.set_actor_rotation(unreal.Rotator(-12, -35, 0), False)

    post = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.PostProcessVolume, unreal.Vector(0, 0, 0)
    )
    post.set_actor_label("Reference Grade")
    post.set_editor_property("unbound", True)
    level_subsystem.save_current_level()


def main() -> None:
    for texture in sorted(TEXTURE_DIR.glob("hero-*.png")):
        import_texture(texture)
    for slug in ("high", "mid", "low"):
        import_skeletal_mesh(MODEL_DIR / f"sausage-hero-{slug}.fbx")
    build_level()
    unreal.EditorAssetLibrary.save_directory("/Game/SausageField", only_if_is_dirty=False, recursive=True)
    unreal.log("Sausage Field shared assets imported and reference level created.")


main()
