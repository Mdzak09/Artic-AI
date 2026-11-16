param(
    [string]$PolarionHome = $env:POLARION_HOME,
    [string]$JdkHome = 'C:\Program Files\Java\jdk-17',
    [switch]$PublishWorkspaceClasses
)
$ErrorActionPreference = 'Stop'
if (-not $PolarionHome) { $PolarionHome = 'C:\Polarion' }

$plugins = Join-Path $PolarionHome 'polarion\plugins'
$servlet = Get-ChildItem $plugins -Filter 'javax.servlet_*.jar' | Select-Object -First 1
$platform = Get-ChildItem $plugins -Directory -Filter 'com.polarion.platform_*' | Select-Object -First 1
$repository = Get-ChildItem $plugins -Directory -Filter 'com.polarion.platform.repository_*' | Select-Object -First 1
$tracker = Get-ChildItem $plugins -Directory -Filter 'com.polarion.alm.tracker_*' | Select-Object -First 1
$subterra = Get-ChildItem $plugins -Directory -Filter 'com.polarion.subterra.base_*' | Select-Object -First 1
$portal = Get-ChildItem $plugins -Directory -Filter 'com.polarion.portal.tomcat_*' | Select-Object -First 1
$ui = Get-ChildItem $plugins -Directory -Filter 'com.polarion.alm.ui_*' | Select-Object -First 1
if (-not $servlet -or -not $platform -or -not $repository -or -not $tracker -or -not $subterra -or -not $portal -or -not $ui) {
    throw "Required servlet, platform, repository, tracker, subterra, portal-tomcat, or UI SDK APIs were not found under $plugins."
}

$javac = Join-Path $JdkHome 'bin\javac.exe'
$jar = Join-Path $JdkHome 'bin\jar.exe'
$java = Join-Path $JdkHome 'bin\java.exe'
if (-not (Test-Path $javac) -or -not (Test-Path $jar) -or -not (Test-Path $java)) {
    throw "JDK 17 javac, jar, and java were not found under $JdkHome."
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$classes = Join-Path $root 'build\staging'
$dist = Join-Path $root 'dist'
$workspaceClasses = Join-Path $root 'bin'
$classpath = @(
    (Join-Path $servlet.DirectoryName $servlet.Name),
    (Join-Path $platform.FullName 'platform.jar'),
    (Join-Path $repository.FullName 'platform-repository.jar'),
    (Join-Path $subterra.FullName 'subterra-base-core.jar'),
    (Join-Path $subterra.FullName 'subterra-base-data.jar'),
    (Join-Path $portal.FullName 'portal-tomcat.jar'),
    (Join-Path $ui.FullName 'ui.jar')
) + @(Get-ChildItem $tracker.FullName -Filter '*.jar' | Select-Object -ExpandProperty FullName) -join ';'

if (Test-Path $classes) { Remove-Item -LiteralPath $classes -Recurse -Force }
New-Item -ItemType Directory -Path $classes,$dist -Force | Out-Null
$sources = Get-ChildItem (Join-Path $root 'src') -Filter '*.java' -Recurse | Select-Object -ExpandProperty FullName
& $javac --release 17 -encoding UTF-8 -cp $classpath -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'Plugin compilation failed.' }
$moduleOutput = Join-Path $classes 'META-INF'
New-Item -ItemType Directory -Path $moduleOutput -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'src\META-INF\hivemodule.xml') `
    -Destination (Join-Path $moduleOutput 'hivemodule.xml') -Force
$testSources = Get-ChildItem (Join-Path $root 'tests') -Filter '*.java' -Recurse | Select-Object -ExpandProperty FullName
if ($testSources) {
    $testClasses = Join-Path $root 'build\test-staging'
    if (Test-Path $testClasses) { Remove-Item -LiteralPath $testClasses -Recurse -Force }
    New-Item -ItemType Directory -Path $testClasses -Force | Out-Null
    & $javac --release 17 -encoding UTF-8 -cp $classes -d $testClasses $testSources
    if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
    & $java -cp "$classes;$testClasses" com.zaamtech.polarion.aiassistant.config.AssistantSettingsTest
    if ($LASTEXITCODE -ne 0) { throw 'Settings/access tests failed.' }
}

$bundle = Join-Path $dist 'com.zaamtech.polarion.aiassistant_1.0.0.jar'
Push-Location $root
try {
    & $jar cfm $bundle 'META-INF\MANIFEST.MF' -C build\staging . -C . plugin.xml -C . webapp -C . config -C . README.md
    if ($LASTEXITCODE -ne 0) { throw 'Bundle packaging failed.' }
} finally { Pop-Location }
if ($PublishWorkspaceClasses) {
    Copy-Item -Path (Join-Path $classes '*') -Destination $workspaceClasses -Recurse -Force
    Write-Output "Published compiled workspace classes to $workspaceClasses. A running Polarion runtime still requires a bundle refresh/restart to load changed Java classes."
}
Write-Output "Built $bundle against Polarion SDK at $PolarionHome using $JdkHome"
