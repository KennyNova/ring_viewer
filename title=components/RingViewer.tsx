@@ interface RingViewerProps {
-  selectedModel: string;
+  selectedModel: string;
+  category: string; // Ensure category is passed
@@ export default function RingViewer({ models, selectedModel, category }: RingViewerProps) {
-  return (
-    <div style={{ width: "100vw", height: "100vh" }}>
-      <Canvas 
-        // ... other props
-      >
-        <Suspense fallback={<Loader />}>
-          <PerformanceMonitor
-            bounds={(fps) => [50, 60]}
-            ms={500}
-            iterations={5}
-            step={0.2}
-          >
-            <RingModel key={selectedModel} modelPath={`/3d/${category}/${selectedModel}.glb`} />
-          </PerformanceMonitor>
-        </Suspense>
-        {/* other components */}
-      </Canvas>
-    </div>
-  );
+  // If selectedModel already ends with '.glb', use it directly,
+  // otherwise, append the extension.
+  const fileName = selectedModel.endsWith('.glb') ? selectedModel : `${selectedModel}.glb`;
+
+  return (
+    <div style={{ width: "100vw", height: "100vh" }}>
+      <Canvas 
+        // ... other props remain unchanged
+      >
+        <Suspense fallback={<Loader />}>
+          <PerformanceMonitor
+            bounds={(fps) => [50, 60]}
+            ms={500}
+            iterations={5}
+            step={0.2}
+          >
+            <RingModel key={selectedModel} modelPath={`/3d/${category}/${fileName}`} />
+          </PerformanceMonitor>
+        </Suspense>
+        {/* other components */}
+      </Canvas>
+    </div>
+  );
} 