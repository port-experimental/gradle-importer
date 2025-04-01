import { upsertEntity } from './port_client';
import axios from 'axios';
import * as base64 from 'base-64';

async function main() {
    try {
        // Azure DevOps configuration
        const adoOrg = process.env.ADO_ORG;
        const adoPat = process.env.ADO_PAT;
        const portBlueprint = process.env.PORT_BLUEPRINT || 'repository';

        if (!adoOrg || !adoPat) {
            throw new Error('ADO_ORG and ADO_PAT must be set in the environment variables');
        }

        // Base64 encode the PAT for authorization
        const authorization = `Basic ${base64.encode(`${adoOrg}:${adoPat}`)}`;

        // Create axios instance for ADO API
        const adoApi = axios.create({
            baseURL: `https://dev.azure.com/${adoOrg}`,
            headers: {
                'Authorization': authorization,
                'Accept': 'application/json',
            },
        });

        console.log(`Fetching projects from ADO org: ${adoOrg}`);

        // Get all projects
        const projectsResponse = await adoApi.get('/_apis/projects?api-version=7.0');
        const projects = projectsResponse.data.value;

        console.log(`Found ${projects.length} projects`);

        // Process each project
        for (const project of projects) {
            console.log(`Processing project: ${project.name}`);

            // Get all repositories for the project
            const reposResponse = await adoApi.get(`/${project.name}/_apis/git/repositories?api-version=7.0`);
            const repositories = reposResponse.data.value;

            console.log(`Found ${repositories.length} repositories in project ${project.name}`);

            // Process each repository
            for (const repo of repositories) {
                console.log(`Processing repository: ${repo.name}`);

                let plugins: Record<string, string> = {};
                let variables: Record<string, string> = {};
                let dependencies: Record<string, string> = {};
                let gradleVersion: string | null = null;
                let gradleDistributionUrl: string | null = null;
                // Try to find build.gradle and build.gradle.kts files in the root directory
                const gradleFiles = [
                    { path: 'build.gradle', type: 'groovy' },
                    { path: 'build.gradle.kts', type: 'kotlin' }
                ];

                for (const file of gradleFiles) {
                    try {
                        // Get file content
                        const fileResponse = await adoApi.get(
                            `/${project.name}/_apis/git/repositories/${repo.id}/items?path=${file.path}&includeContent=true&api-version=7.0`
                        );

                        const gradleFileContent = fileResponse.data.content;
                        console.log(`Found ${file.path} in ${repo.name}`);

                        // Parse the gradle file content
                        variables = parseGradleVariables(gradleFileContent);
                        plugins = parseGradlePlugins(gradleFileContent);
                        dependencies = parseGradleDependencies(gradleFileContent, variables);

                        console.log(`Parsed variables from ${file.path} in ${repo.name}:`, variables);
                        console.log(`Parsed plugins from ${file.path} in ${repo.name}:`, plugins);
                        console.log(`Parsed dependencies from ${file.path} in ${repo.name}:`, dependencies);

                    } catch (error: any) {
                        // It's okay if the file doesn't exist in this repo
                        if (error.response && error.response.status === 404) {
                            console.log(`${file.path} not found in ${repo.name}, skipping...`);
                        } else {
                            console.error(`Error processing ${file.path} in ${repo.name}:`, error.message);
                        }
                    }
                }

                // Try to find build.gradle and build.gradle.kts files in the root directory
                const propertyFiles = [
                    'gradle/wrapper/gradle-wrapper.properties'
                ];

                for (const file of propertyFiles) {
                    try {
                        const fileResponse = await adoApi.get(
                            `/${project.name}/_apis/git/repositories/${repo.id}/items?path=${file}&includeContent=true&api-version=7.0`
                        );

                        const content = fileResponse.data.content;
                        // Parse the gradle wrapper properties to extract the distribution URL
                        const distributionUrlRegex = /distributionUrl=([^\r\n]+)/;
                        const distributionUrlMatch = content.match(distributionUrlRegex);

                        if (distributionUrlMatch && distributionUrlMatch[1]) {
                            gradleDistributionUrl = distributionUrlMatch[1].replace(/\\:/g, ':');
                            console.log(`Gradle distribution URL: ${gradleDistributionUrl}`);

                            // Extract the Gradle version from the URL
                            const gradleVersionRegex = /gradle-([0-9.]+)/;
                            const gradleVersionMatch = gradleDistributionUrl?.match(gradleVersionRegex);

                            if (gradleVersionMatch && gradleVersionMatch[1]) {
                                console.log(`Gradle version: ${gradleVersionMatch[1]}`);
                                gradleVersion = gradleVersionMatch[1];
                            }
                        }
                    } catch (error: any) {
                        if (error.response && error.response.status === 404) {
                            console.log(`${file} not found in ${repo.name}, skipping...`);
                        } else {
                            console.error(`Error processing ${file} in ${repo.name}:`, error.message);
                        }
                    }
                }

                // Create a unique identifier for the Port entity
                const identifier = `${project.name}/${repo.name}`;

                // Update the entity in Port
                await upsertEntity(
                    portBlueprint,
                    identifier,
                    {
                        plugins: plugins,
                        dependencies: dependencies,
                        gradle_version: gradleVersion,
                        gradle_distribution_url: gradleDistributionUrl,
                    },
                    {
                        // You can add relations here if needed
                    }
                );

                console.log(`Successfully updated entity in Port for ${repo.name}`);
            }
        }

        console.log('All repositories processed successfully');
    } catch (error: any) {
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

function parseGradleVariables(content: string): Record<string, string> {
    const variables: Record<string, string> = {};
    // Match both Groovy (def) and Kotlin (val) variable declarations
    const variableRegex = /(?:def|val)\s+(\w+)\s*=\s*['"]([^'"]*)['"]/g;

    let match;

    while ((match = variableRegex.exec(content)) !== null) {
        const key = match[1];
        const value = match[2];
        variables[key] = value;
    }

    return variables;
}

/**
 * Parses Gradle files to extract information about implementation dependencies.
 * This module provides utility functions to analyze both Groovy and Kotlin-style Gradle build files.
 */

function parseGradleDependencies(content: string, variables: Record<string, string>): Record<string, string> {
    const dependencyRegex = /dependencies\s*{([^}]*)}/s;

    let match = content.match(dependencyRegex);

    if (!match) {
        return {};
    }

    const dependenciesBlock = match[1];

    const implementationRegex = /\s*implementation\(?\s*['"]([^'"]*)['"]\)?/g;
    const dependencyStatements: string[] = [];

    while ((match = implementationRegex.exec(dependenciesBlock)) !== null) {
        const dependencyName = match[1];
        dependencyStatements.push(dependencyName);
    }

    console.log(`Found ${dependencyStatements.length} dependency statements:`, dependencyStatements);
    return Object.fromEntries(dependencyStatements.map(dependency => {
        // Split by the rightmost colon to separate the version from the rest
        // Example: "org.apache.commons:commons-lang3:$commonsLangVersion"
        const lastColonIndex = dependency.lastIndexOf(':');
        const dependencyWithoutVersion = dependency.substring(0, lastColonIndex);
        const versionPart = dependency.substring(lastColonIndex + 1);

        if (versionPart) {
            // Remove $ and {} characters from versionPart if they exist
            const cleanVersionPart = versionPart.replace(/^\$/, '').replace(/^\{(.*)\}$/, '$1');
            return [dependencyWithoutVersion, variables[cleanVersionPart]];
        }
        return [dependencyWithoutVersion, 'version unknown'];
    }))
}
