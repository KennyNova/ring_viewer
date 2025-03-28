# Using 3DM Files in Ring Viewer

The Ring Viewer now supports Rhino 3DM files in addition to GLB files. This document explains how to use 3DM files with the application.

## Supported File Formats

- **GLB** (glTF Binary) - Default format
- **3DM** (Rhino 3D Models) - New supported format

## How to Use 3DM Files

### File Naming Convention

You can use 3DM files by either:

1. Explicitly including the extension in the model name:
   ```javascript
   // In your code when passing models to RingViewer
   const models = ["my_ring.3dm", "another_ring.glb"];
   ```

2. Using the same base name as your GLB files:
   If you have both `my_ring.glb` and `my_ring.3dm`, the application will automatically choose the GLB version by default. To force using the 3DM version, specify the full name with extension.

### File Placement

Place your 3DM files in the same location as your GLB files:
```
/public/3d/[category]/[model_name].3dm
```

For example:
```
/public/3d/engagement/solitaire.3dm
```

## Exporting 3DM Files from Rhino

For best results when exporting 3DM files from Rhino:

1. Ensure all objects are mesh objects (use the `Mesh` command in Rhino if needed)
2. Name your objects appropriately - the names will be used in the viewer
3. Keep the file size reasonable for web use (under 5MB if possible)
4. Use simple materials as complex Rhino materials may not translate correctly

## Troubleshooting

If your 3DM file doesn't load correctly:

1. Check the browser console for error messages
2. Ensure the file is properly exported from Rhino 
3. Try simplifying the model if it's too complex
4. Verify the file is accessible at the expected URL

### Common Error: "Module not found: Can't resolve 'fs'"

If you encounter the error:
```
Module not found: Can't resolve 'fs'
```

This happens because the Rhino3DM library tries to use Node.js's 'fs' module in the browser environment. This issue has been fixed in our implementation by:

1. Adding fallbacks in the webpack configuration:
   ```javascript
   // In next.config.js
   config.resolve.fallback = {
     ...config.resolve.fallback,
     fs: false,
     path: false,
     crypto: false,
     os: false,
   };
   ```

2. Using dynamic imports to load the rhino3dm module only in the browser:
   ```javascript
   // Dynamic import instead of static import
   import('rhino3dm').then(module => {
     // Initialize and use the module
   });
   ```

3. Providing fallbacks for when the module is not available.

If you're implementing 3DM support in a different project, ensure you've added similar configurations to handle Node.js modules in the browser environment.

## Technical Implementation

The Ring Viewer uses `rhino3dm` library to load and process 3DM files. The implementation:

1. Detects file extension to determine the loader to use
2. Loads 3DM files using the `rhino3dm` library
3. Converts Rhino objects to Three.js meshes
4. Applies default materials to the meshes
5. Integrates the meshes into the existing gem/band detection system

## Limitations

There are some limitations when using 3DM files:

1. Material information may not be fully preserved from the original Rhino file
2. Complex Rhino objects might not render correctly
3. Only mesh objects are supported (NURBS surfaces will not be displayed)
4. The gem/band detection algorithm may be less accurate with 3DM files

## Example

```jsx
import RingViewer from '../components/RingViewer';

export default function MyPage() {
  return (
    <RingViewer 
      models={["solitaire.3dm", "halo.glb"]} 
      selectedModel="solitaire.3dm"
      category="engagement"
    />
  );
}
``` 