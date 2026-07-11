"""Build the shared photorealistic hero sausage and engine exports.

Run with:
  blender --background --python art/blender/generate_hero.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ART_DIR = ROOT / "art" / "blender"
SHARED_DIR = ROOT / "shared-assets"
MODEL_DIR = SHARED_DIR / "models"
TEXTURE_DIR = SHARED_DIR / "textures"
REFERENCE_DIR = ART_DIR / "references"
SOURCE_TEXTURE = ROOT / "assets" / "imagegen" / "sausage-fatty.png"
HEIGHT = 1.4
BONE_COUNT = 8


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.armatures):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def radius_at(t: float) -> float:
    base = 0.108
    asymmetry = 1.0 + 0.055 * math.sin(t * math.pi * 5.0 + 0.7) + 0.025 * math.sin(t * 19.0)
    root = 0.74 + 0.26 * min(1.0, t / 0.1)
    tip = 1.0
    if t > 0.83:
        cosine = max(0.0, math.cos((t - 0.83) / 0.17 * math.pi * 0.5))
        tip = max(0.05, cosine ** 0.62)
    return base * asymmetry * root * tip


def center_at(t: float) -> tuple[float, float]:
    return (
        0.034 * t * t + 0.012 * math.sin(t * math.pi * 2.2),
        -0.021 * t * t + 0.009 * math.sin(t * math.pi * 3.1 + 0.8),
    )


def create_mesh(name: str, rings: int, radial_segments: int) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    stride = radial_segments + 1
    for ring in range(rings):
        t = ring / (rings - 1)
        y = t * HEIGHT
        radius = radius_at(t)
        cx, cz = center_at(t)
        for segment in range(stride):
            u = segment / radial_segments
            angle = u * math.tau
            organic = 1.0 + 0.025 * math.sin(angle * 3.0 + t * 13.0) + 0.012 * math.sin(angle * 7.0 - t * 21.0)
            vertices.append((cx + math.cos(angle) * radius * organic, cz + math.sin(angle) * radius / organic, y))
            uvs.append((u, t * 2.1))
    for ring in range(rings - 1):
        for segment in range(radial_segments):
            a = ring * stride + segment
            b = a + 1
            c = a + stride + 1
            d = a + stride
            faces.append((a, b, c, d))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def create_armature() -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("SausageRig")
    armature = bpy.data.objects.new("SausageRig", armature_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    names = ["SausageRoot"] + [f"Sausage_{index:02d}" for index in range(1, 7)] + ["SausageTip"]
    previous = None
    segment = HEIGHT / BONE_COUNT
    for index, name in enumerate(names):
        bone = armature_data.edit_bones.new(name)
        bone.head = (0, 0, index * segment)
        bone.tail = (0, 0, (index + 1) * segment)
        if previous is not None:
            bone.parent = previous
            bone.use_connect = True
        previous = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.show_in_front = True
    return armature


def bind_to_rig(obj: bpy.types.Object, armature: bpy.types.Object) -> None:
    names = [bone.name for bone in armature.data.bones]
    groups = [obj.vertex_groups.new(name=name) for name in names]
    for vertex in obj.data.vertices:
        t = max(0.0, min(1.0, vertex.co.z / HEIGHT))
        position = t * (BONE_COUNT - 1)
        lower = min(BONE_COUNT - 1, int(math.floor(position)))
        upper = min(BONE_COUNT - 1, lower + 1)
        blend = position - lower
        groups[lower].add([vertex.index], 1.0 - blend, "REPLACE")
        if upper != lower:
            groups[upper].add([vertex.index], blend, "ADD")
    modifier = obj.modifiers.new(name="SausageArmature", type="ARMATURE")
    modifier.object = armature
    obj.parent = armature


def set_principled_input(node: bpy.types.Node, names: list[str], value) -> None:
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def create_sausage_material() -> bpy.types.Material:
    material = bpy.data.materials.new("M_Sausage_Casing")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    image = nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(str(SOURCE_TEXTURE), check_existing=True)
    image.interpolation = "Linear"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 34.0
    noise.inputs["Detail"].default_value = 5.5
    noise.inputs["Roughness"].default_value = 0.72
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.035
    links.new(image.outputs["Color"], principled.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    set_principled_input(principled, ["Roughness"], 0.34)
    set_principled_input(principled, ["IOR"], 1.42)
    set_principled_input(principled, ["Coat Weight", "Clearcoat"], 0.86)
    set_principled_input(principled, ["Coat Roughness", "Clearcoat Roughness"], 0.09)
    set_principled_input(principled, ["Subsurface Weight", "Subsurface"], 0.2)
    set_principled_input(principled, ["Subsurface Radius"], (1.0, 0.26, 0.18))
    return material


def export_variant(obj: bpy.types.Object, armature: bpy.types.Object, slug: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_viewport = False
    obj.hide_render = False
    obj.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(MODEL_DIR / f"sausage-hero-{slug}.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_skins=True,
        export_animations=False,
    )
    bpy.ops.export_scene.fbx(
        filepath=str(MODEL_DIR / f"sausage-hero-{slug}.fbx"),
        use_selection=True,
        add_leaf_bones=False,
        bake_anim=False,
        axis_forward="-Y",
        axis_up="Z",
    )
    obj.hide_viewport = True
    obj.hide_render = True


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def create_reference_render(hero: bpy.types.Object, armature: bpy.types.Object) -> None:
    hero.hide_viewport = False
    hero.hide_render = False
    armature.hide_viewport = False
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(REFERENCE_DIR / "sausage-hero-reference.png")
    scene.render.film_transparent = False

    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.015))
    ground = bpy.context.object
    ground_material = bpy.data.materials.new("M_ReferenceGround")
    ground_material.diffuse_color = (0.075, 0.12, 0.045, 1)
    ground.data.materials.append(ground_material)

    bpy.ops.object.camera_add(location=(2.65, -2.7, 1.35))
    camera = bpy.context.object
    camera.data.lens = 62
    look_at(camera, Vector((0.0, 0.0, 0.72)))
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(1.8, -1.4, 2.8))
    key = bpy.context.object
    key.data.energy = 850
    key.data.shape = "DISK"
    key.data.size = 2.2
    key.data.color = (1.0, 0.56, 0.32)
    look_at(key, Vector((0.0, 0.0, 0.7)))
    bpy.ops.object.light_add(type="AREA", location=(-1.5, -1.4, 1.8))
    fill = bpy.context.object
    fill.data.energy = 530
    fill.data.size = 3.0
    fill.data.color = (0.48, 0.67, 1.0)
    look_at(fill, Vector((0.0, 0.0, 0.65)))
    bpy.ops.object.light_add(type="AREA", location=(0.0, 2.0, 1.8))
    rim = bpy.context.object
    rim.data.energy = 640
    rim.data.size = 1.5
    rim.data.color = (1.0, 0.32, 0.22)
    look_at(rim, Vector((0.0, 0.0, 0.9)))
    scene.world.color = (0.025, 0.035, 0.025)

    pose_bones = armature.pose.bones
    if len(pose_bones) >= 8:
        pose_bones[3].rotation_mode = "XYZ"
        pose_bones[3].rotation_euler.y = math.radians(-5)
        pose_bones[4].rotation_mode = "XYZ"
        pose_bones[4].rotation_euler.y = math.radians(-8)
        pose_bones[5].rotation_mode = "XYZ"
        pose_bones[5].rotation_euler.y = math.radians(-5)
    scene.render.image_settings.color_mode = "RGBA"
    bpy.ops.render.render(write_still=True)


def main() -> None:
    for directory in (ART_DIR, MODEL_DIR, TEXTURE_DIR, REFERENCE_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    reset_scene()
    material = create_sausage_material()
    armature = create_armature()
    variants = [
        ("high", 65, 32),
        ("mid", 37, 18),
        ("low", 21, 12),
    ]
    objects: dict[str, bpy.types.Object] = {}
    for slug, rings, radial in variants:
        obj = create_mesh(f"SausageHero_{slug.title()}", rings, radial)
        obj.data.materials.append(material)
        bind_to_rig(obj, armature)
        objects[slug] = obj
    for slug, _, _ in variants:
        export_variant(objects[slug], armature, slug)
    objects["high"].hide_viewport = False
    objects["high"].hide_render = False
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.ops.wm.save_as_mainfile(filepath=str(ART_DIR / "sausage-field-hero.blend"))
    create_reference_render(objects["high"], armature)
    summary = {
        "blend": str(ART_DIR / "sausage-field-hero.blend"),
        "models": sorted(path.name for path in MODEL_DIR.glob("sausage-hero-*")),
        "reference": str(REFERENCE_DIR / "sausage-hero-reference.png"),
    }
    print("SAUSAGE_FIELD_EXPORT=" + json.dumps(summary))


if __name__ == "__main__":
    main()
