import { upsertEntity } from './port_client';
async function main() {
    try {
        // Get the gradle file content from the environment variable
        const gradleFileContent = process.env.GRADLE_FILE_CONTENT!;
        const blueprint = process.env.BLUEPRINT!;
        const identifier = process.env.IDENTIFIER!;
        const runId = process.env.RUN_ID!;
        
        console.log(`Parsing gradle content for ${blueprint}/${identifier}`);
        
        // Parse the gradle file content directly
        const plugins = parseGradlePlugins(gradleFileContent);
        
        console.log("Parsed plugins:", plugins);
        
        // Update the entity in Port
        const response = await upsertEntity(
            blueprint,
            identifier,
            {
                plugins: plugins,
            },
            {} // No relations to update
        );
        
        console.log('Successfully updated entity in Port');
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}


main();

/**
* Parse a Gradle file and extract plugins with their versions
* @param gradleFileContent Path to the Gradle build file
* @returns Object with plugin names as keys and versions as values
*/
function parseGradlePlugins(content: string): Record<string, string> {
    // Find the plugins block - look for plugins { ... }
    const pluginsBlockRegex = /plugins\s*{([^}]*)}/s;
    const pluginsMatch = content.match(pluginsBlockRegex);
    
    if (!pluginsMatch) {
        return {};
    }
    
    const pluginsBlock = pluginsMatch[1];
    const result: Record<string, string> = {};
    
    // Match Groovy format: id 'plugin.name' version 'x.y.z'
    const groovyPluginRegex = /id\s*['"]([^'"]*)['"]\s*(?:version\s*['"]([^'"]*)['"]\s*)?/g;
    
    // Match Kotlin format: id("plugin.name") version "x.y.z" with optional backslashes before quotes
    const kotlinPluginRegex = /id\s*\(\s*(?:\\?")([^"]*)(?:\\?)"\s*\)(?:\s*version\s*(?:\\?")([^"]*)(?:\\?)"\s*)?/g;
    
    // Choose the appropriate regex based on the content format
    const pluginRegex = content.includes('id(') ? kotlinPluginRegex : groovyPluginRegex;
    
    let match;
    while ((match = pluginRegex.exec(pluginsBlock)) !== null) {
        const pluginName = match[1];
        const version = match[2] || "No version specified";
        result[pluginName] = version;
    }
    
    return result;
}